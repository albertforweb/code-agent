#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'

const root = process.cwd()
const destinationArg = process.argv.indexOf('--destination')
const destination = path.resolve(root, destinationArg >= 0 ? process.argv[destinationArg + 1] : 'electron/resources/models')
const catalog = JSON.parse(await readFile(new URL('./bundled-models.json', import.meta.url), 'utf8'))
const cacheRoot = path.join(root, '.cache', 'models')
const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN
const headers = {
  'User-Agent': 'CodeAgent-build',
  Accept: 'application/octet-stream',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })

for (const model of catalog.models) {
  const cacheDir = path.join(cacheRoot, model.id, model.revision)
  const cachedModel = path.join(cacheDir, model.file)
  await mkdir(cacheDir, { recursive: true })

  let validCache = existsSync(cachedModel)
  if (validCache) {
    const info = await stat(cachedModel)
    validCache = info.size === model.size && await sha256File(cachedModel) === model.sha256
  }
  if (!validCache) {
    await rm(cachedModel, { force: true })
    await downloadArtifact(model, cachedModel)
  }
  await verifyArtifact(cachedModel, model)

  for (const supportFile of ['LICENSE', 'README.md']) {
    const cachedSupportFile = path.join(cacheDir, supportFile)
    if (!existsSync(cachedSupportFile)) await download(resolveRawUrl(model, supportFile), cachedSupportFile)
  }

  const modelDestination = path.join(destination, model.id)
  await mkdir(modelDestination, { recursive: true })
  await cp(cachedModel, path.join(modelDestination, model.file))
  await cp(path.join(cacheDir, 'LICENSE'), path.join(modelDestination, 'LICENSE'))
  await cp(path.join(cacheDir, 'README.md'), path.join(modelDestination, 'MODEL_CARD.md'))
  console.log(`Bundled ${model.displayName} (${formatBytes(model.size)})`)
}

await writeFile(path.join(destination, 'bundle.json'), `${JSON.stringify(catalog, null, 2)}\n`)

function resolveUrl(model, file) {
  const repository = model.repository.split('/').map(encodeURIComponent).join('/')
  const encodedFile = file.split('/').map(encodeURIComponent).join('/')
  // Use the public, revision-pinned repository endpoint. `/api/resolve-cache`
  // is an internal redirect target whose signed query parameters can expire or
  // be rejected on a different CI runner.
  return `https://huggingface.co/${repository}/resolve/${encodeURIComponent(model.revision)}/${encodedFile}?download=true`
}

function resolveRawUrl(model, file) {
  const repository = model.repository.split('/').map(encodeURIComponent).join('/')
  const encodedFile = file.split('/').map(encodeURIComponent).join('/')
  return `https://huggingface.co/${repository}/raw/${encodeURIComponent(model.revision)}/${encodedFile}`
}

async function downloadArtifact(model, output) {
  try {
    await download(resolveUrl(model, model.file), output)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('returned HTML')) throw error
    // Some managed networks block Hugging Face's browser-style `/resolve`
    // endpoint while allowing the standard Git LFS transfer endpoint. Resolve
    // the same immutable SHA-256 object through LFS without weakening artifact
    // verification.
    const lfsUrl = await resolveLfsDownloadUrl(model)
    await download(lfsUrl, output)
  }
}

async function resolveLfsDownloadUrl(model) {
  const repository = model.repository.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`https://huggingface.co/${repository}.git/info/lfs/objects/batch`, {
    method: 'POST',
    headers: {
      ...headers,
      Accept: 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
    },
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: [{ oid: model.sha256, size: model.size }],
    }),
  })
  if (!response.ok) throw new Error(`Unable to resolve Git LFS download for ${model.file}: ${response.status}`)
  const result = await response.json()
  const href = result?.objects?.[0]?.actions?.download?.href
  if (typeof href !== 'string' || !href.startsWith('https://')) {
    throw new Error(`Hugging Face did not provide a Git LFS download for ${model.file}`)
  }
  return href
}

async function download(url, output) {
  const partial = `${output}.part`
  await rm(partial, { force: true })
  const response = await fetchWithRetry(url)
  if (!response.ok || !response.body) {
    const detail = await response.text().then(value => value.trim().slice(0, 500)).catch(() => '')
    const tokenHint = response.status === 401 || response.status === 403
      ? ' Set the HF_TOKEN repository secret if Hugging Face requires authenticated CI downloads.'
      : ''
    throw new Error(`Unable to download ${url}: ${response.status}${detail ? ` — ${detail}` : ''}.${tokenHint}`)
  }
  if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error(`Hugging Face returned HTML instead of an artifact for ${url}`)
  }
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }))
    await rename(partial, output)
  } catch (error) {
    await rm(partial, { force: true })
    throw error
  }
}

async function fetchWithRetry(url) {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504])
  let response
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetch(url, { redirect: 'follow', headers })
      if (!retryableStatuses.has(response.status) || attempt === 3) return response
      await response.body?.cancel()
    } catch (error) {
      if (attempt === 3) throw error
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (2 ** attempt)))
  }
  return response
}

async function verifyArtifact(file, model) {
  const info = await stat(file)
  if (info.size !== model.size) throw new Error(`Size mismatch for ${model.file}: expected ${model.size}, received ${info.size}`)
  const digest = await sha256File(file)
  if (digest !== model.sha256) throw new Error(`Checksum mismatch for ${model.file}: expected ${model.sha256}, received ${digest}`)
}

async function sha256File(file) {
  const digest = createHash('sha256')
  await pipeline(createReadStream(file), digest)
  return digest.digest('hex')
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}
