#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const rootArg = readArgument('--root')
const target = readArgument('--target')
assert(rootArg, 'Missing --root <llama.cpp directory>.')
assert(target, 'Missing --target <platform-architecture>.')

const bundleRoot = path.resolve(process.cwd(), rootArg)
const targetRoot = path.join(bundleRoot, target)
assert(existsSync(targetRoot), `Missing bundled llama.cpp target: ${targetRoot}`)

const manifestPath = path.join(bundleRoot, 'bundle.json')
assert(existsSync(manifestPath), `Missing llama.cpp bundle manifest: ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert(manifest.targets?.includes(target), `llama.cpp bundle manifest does not include ${target}`)

const files = listFiles(targetRoot).map(file => path.basename(file).toLowerCase())
const windows = target.startsWith('win32-')
assert(files.includes(windows ? 'llama-server.exe' : 'llama-server'), `Missing llama-server for ${target}`)

if (windows) {
  for (const dependency of ['llama.dll', 'ggml.dll', 'ggml-base.dll', 'llama-server-impl.dll']) {
    assert(files.includes(dependency), `Windows llama.cpp bundle is missing ${dependency}`)
  }
  assert(files.includes('ggml-cpu.dll') || files.some(file => file.startsWith('ggml-cpu-') && file.endsWith('.dll')), 'Windows llama.cpp bundle is missing a CPU backend DLL')
}

console.log(`Verified bundled llama.cpp ${manifest.version ?? ''} for ${target}: ${targetRoot}`)

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function listFiles(directory) {
  const files = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(candidate)
      else if (entry.isFile()) files.push(candidate)
    }
  }
  return files
}
