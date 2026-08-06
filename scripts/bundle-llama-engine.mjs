#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { chmod, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const destinationArg = process.argv.indexOf('--destination')
const destination = path.resolve(root, destinationArg >= 0 ? process.argv[destinationArg + 1] : 'electron/resources/llama.cpp')
const supportedTargets = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64']
const targetArg = process.argv.indexOf('--target')
if (process.argv.includes('--all') && targetArg >= 0) throw new Error('Use either --all or --target, not both.')
const targets = process.argv.includes('--all')
  ? supportedTargets
  : targetArg >= 0
    ? (process.argv[targetArg + 1] ?? '').split(',').filter(Boolean)
    : [`${process.platform}-${process.arch}`]
if (targets.length === 0 || targets.some(target => !supportedTargets.includes(target))) {
  throw new Error(`Unsupported llama.cpp target. Expected one of: ${supportedTargets.join(', ')}`)
}
const cacheRoot = path.join(root, '.cache', 'llama.cpp')
const bundle = JSON.parse(await readFile(new URL('./bundled-llama.json', import.meta.url), 'utf8'))
if (bundle.schemaVersion !== 1 || !bundle.version || !bundle.assets) throw new Error('Invalid bundled llama.cpp manifest.')
const headers = {
  Accept: 'application/octet-stream',
  'User-Agent': 'CodeAgent-build',
  ...((process.env.GITHUB_TOKEN || process.env.GH_TOKEN) ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN || process.env.GH_TOKEN}` } : {}),
}

// Desktop builds reuse this source directory. Remove engines from an earlier
// platform build so a Windows installer cannot accidentally ship a host binary.
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
for (const target of targets) {
  const asset = bundle.assets[target]
  if (!asset?.file || !asset.sha256) throw new Error(`Bundled llama.cpp manifest is missing ${target}.`)
  const assetName = asset.file
  const targetCache = path.join(cacheRoot, bundle.version, target)
  const archive = path.join(cacheRoot, bundle.version, assetName)
  const marker = path.join(targetCache, '.complete')
  if (!existsSync(marker)) {
    await mkdir(path.dirname(archive), { recursive: true })
    if (!existsSync(archive)) {
      await download(`https://github.com/ggml-org/llama.cpp/releases/download/${encodeURIComponent(bundle.version)}/${encodeURIComponent(assetName)}`, archive)
    }
    const actual = await sha256File(archive)
    if (actual !== asset.sha256.toLowerCase()) throw new Error(`Checksum mismatch for ${assetName}: expected ${asset.sha256}, received ${actual}`)
    await rm(targetCache, { recursive: true, force: true })
    await mkdir(targetCache, { recursive: true })
    extract(archive, targetCache)
    await writeFile(marker, `${bundle.version}\n`)
  }
  const targetDestination = path.join(destination, target)
  await rm(targetDestination, { recursive: true, force: true })
  // Preserve the release archive's relative dylib symlinks. Node's default
  // cp behavior resolves symlink targets to absolute cache paths, which makes
  // the macOS app bundle non-relocatable and causes codesign verification to
  // fail with "invalid destination for symbolic link in bundle".
  await cp(targetCache, targetDestination, { recursive: true, verbatimSymlinks: true })
  await makeExecutablesRunnable(targetDestination)
  console.log(`Bundled llama.cpp ${bundle.version} for ${target}`)
}
await writeFile(path.join(destination, 'bundle.json'), `${JSON.stringify({ version: bundle.version, targets }, null, 2)}\n`)

async function download(url, output) {
  const partial = `${output}.part`
  await rm(partial, { force: true })
  const response = await fetchWithRetry(url)
  if (!response.ok || !response.body) {
    const detail = await response.text().then(value => value.trim().slice(0, 500)).catch(() => '')
    throw new Error(`Unable to download ${url}: ${response.status}${detail ? ` — ${detail}` : ''}`)
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers })
      if (!retryableStatuses.has(response.status) || attempt === 3) return response
      await response.body?.cancel()
    } catch (error) {
      if (attempt === 3) throw error
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (2 ** attempt)))
  }
  throw new Error(`Unable to download ${url}.`)
}

async function sha256File(file) {
  const digest = createHash('sha256')
  await pipeline(createReadStream(file), digest)
  return digest.digest('hex')
}

function extract(archive, output) {
  const zip = archive.endsWith('.zip')
  const command = zip && process.platform === 'win32' ? 'powershell.exe' : zip ? 'unzip' : 'tar'
  const args = zip && process.platform === 'win32'
    ? ['-NoProfile', '-NonInteractive', '-Command', '& { param($archive, $output) Expand-Archive -LiteralPath $archive -DestinationPath $output -Force }', archive, output]
    : zip ? ['-q', archive, '-d', output] : ['-xzf', archive, '-C', output]
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Unable to extract ${archive}: ${result.stderr || result.stdout}`)
}

async function makeExecutablesRunnable(directory) {
  if (process.platform === 'win32') return
  const { readdir } = await import('node:fs/promises')
  const pending = [directory]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(candidate)
      else if (entry.isFile() && (entry.name === 'llama-server' || entry.name === 'llama')) await chmod(candidate, 0o755)
    }
  }
}
