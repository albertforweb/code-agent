#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const rootArg = readArgument('--root')
assert(rootArg, 'Missing --root <bundled models directory>.')
const bundleRoot = path.resolve(process.cwd(), rootArg)
const manifestPath = path.join(bundleRoot, 'bundle.json')
assert(existsSync(manifestPath), `Missing bundled model manifest: ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.schemaVersion, 1, 'Unsupported bundled model manifest schema.')
assert(manifest.models?.length > 0, 'Bundled model manifest is empty.')

for (const model of manifest.models) {
  const modelRoot = path.join(bundleRoot, model.id)
  const modelPath = path.join(modelRoot, model.file)
  for (const required of [modelPath, path.join(modelRoot, 'LICENSE'), path.join(modelRoot, 'MODEL_CARD.md')]) {
    assert(existsSync(required), `Missing bundled model artifact: ${required}`)
  }
  assert.equal((await stat(modelPath)).size, model.size, `Bundled model size mismatch: ${model.file}`)
  assert.equal(await sha256File(modelPath), model.sha256, `Bundled model checksum mismatch: ${model.file}`)
  assert.equal(model.license, 'Apache-2.0', `Unexpected bundled model license: ${model.license}`)
  console.log(`Verified ${model.displayName}: ${modelPath}`)
}

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function sha256File(file) {
  const digest = createHash('sha256')
  await pipeline(createReadStream(file), digest)
  return digest.digest('hex')
}
