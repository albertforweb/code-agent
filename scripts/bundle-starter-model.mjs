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
    await download(resolveUrl(model, model.file), cachedModel)
  }
  await verifyArtifact(cachedModel, model)

  for (const supportFile of ['LICENSE', 'README.md']) {
    const cachedSupportFile = path.join(cacheDir, supportFile)
    if (!existsSync(cachedSupportFile)) await download(resolveUrl(model, supportFile), cachedSupportFile)
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
  // Hugging Face's cache resolver returns the pinned blob/CDN location and
  // avoids accidentally accepting an HTML model page as the artifact.
  return `https://huggingface.co/api/resolve-cache/models/${repository}/${encodeURIComponent(model.revision)}/${encodedFile}`
}

async function download(url, output) {
  const partial = `${output}.part`
  await rm(partial, { force: true })
  const response = await fetch(url, { redirect: 'follow', headers })
  if (!response.ok || !response.body) throw new Error(`Unable to download ${url}: ${response.status}`)
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
