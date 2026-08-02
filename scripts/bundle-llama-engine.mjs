#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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

const metadataCache = path.join(cacheRoot, 'release.json')
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'CodeAgent-build',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
}
let release
const releaseResponse = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', { headers })
if (releaseResponse.ok) {
  release = await releaseResponse.json()
  await mkdir(cacheRoot, { recursive: true })
  await writeFile(metadataCache, `${JSON.stringify(release)}\n`)
} else if (existsSync(metadataCache)) {
  release = JSON.parse(await readFile(metadataCache, 'utf8'))
  console.warn(`GitHub release API returned ${releaseResponse.status}; using cached llama.cpp metadata.`)
} else {
  const cachedVersion = (await readdir(cacheRoot).catch(() => []))
    .filter(entry => /^b\d+$/.test(entry))
    .sort((left, right) => Number(right.slice(1)) - Number(left.slice(1)))[0]
  if (!cachedVersion) throw new Error(`Unable to resolve llama.cpp release: ${releaseResponse.status}`)
  release = { tag_name: cachedVersion, assets: [] }
  console.warn(`GitHub release API returned ${releaseResponse.status}; using cached llama.cpp ${cachedVersion}.`)
}

// Desktop builds reuse this source directory. Remove engines from an earlier
// platform build so a Windows installer cannot accidentally ship a host binary.
await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
for (const target of targets) {
  const assetName = assetNameFor(release.tag_name, target)
  const asset = (release.assets ?? []).find(candidate => candidate.name === assetName) ?? { name: assetName }
  const targetCache = path.join(cacheRoot, release.tag_name, target)
  const archive = path.join(cacheRoot, release.tag_name, assetName)
  const marker = path.join(targetCache, '.complete')
  if (!existsSync(marker)) {
    await mkdir(path.dirname(archive), { recursive: true })
    if (!existsSync(archive)) {
      if (!asset.browser_download_url) throw new Error(`Cached llama.cpp release is missing ${assetName}`)
      await download(asset.browser_download_url, archive)
    }
    if (asset.digest?.startsWith('sha256:')) {
      const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
      if (actual !== asset.digest.slice(7).toLowerCase()) throw new Error(`Checksum mismatch for ${assetName}`)
    }
    await rm(targetCache, { recursive: true, force: true })
    await mkdir(targetCache, { recursive: true })
    extract(archive, targetCache)
    await writeFile(marker, `${release.tag_name}\n`)
  }
  const targetDestination = path.join(destination, target)
  await rm(targetDestination, { recursive: true, force: true })
  await cp(targetCache, targetDestination, { recursive: true })
  await makeExecutablesRunnable(targetDestination)
  console.log(`Bundled llama.cpp ${release.tag_name} for ${target}`)
}
await writeFile(path.join(destination, 'bundle.json'), `${JSON.stringify({ version: release.tag_name, targets }, null, 2)}\n`)

function assetNameFor(version, target) {
  const [platform, arch] = target.split('-')
  if (platform === 'darwin') return `llama-${version}-bin-macos-${arch}.tar.gz`
  if (platform === 'linux') return `llama-${version}-bin-ubuntu-${arch}.tar.gz`
  if (platform === 'win32') return `llama-${version}-bin-win-cpu-${arch}.zip`
  throw new Error(`Unsupported llama.cpp bundle target: ${target}`)
}

async function download(url, output) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'CodeAgent-build' } })
  if (!response.ok || !response.body) throw new Error(`Unable to download ${url}: ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(output))
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
