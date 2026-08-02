import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import test from 'node:test'
import { LocalModelManager } from './local-model-service.js'

test('search returns only public GGUF models', async () => {
  const requests: string[] = []
  const manager = new LocalModelManager({
    rootDir: await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-')),
    bundledModelRoots: [],
    fetchImpl: async input => {
      requests.push(String(input))
      return Response.json([
        { id: 'acme/code-gguf', downloads: 42, likes: 7, tags: ['gguf'], gated: false },
        { id: 'acme/gated-gguf', downloads: 99, likes: 2, tags: ['gguf'], gated: 'manual' },
      ])
    },
  })

  const models = await manager.search('code', 5)
  assert.deepEqual(models.map(model => model.id), ['acme/code-gguf'])
  const url = new URL(requests[0])
  assert.equal(url.searchParams.get('filter'), 'gguf')
  assert.equal(url.searchParams.get('search'), 'code')
  assert.equal(url.searchParams.get('limit'), '5')
})

test('download prefers Q4_K_M and records the local model', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const fetchImpl: typeof fetch = async input => {
    const url = String(input)
    if (url.includes('/api/models/')) {
      return Response.json({
        siblings: [
          { rfilename: 'model-Q8_0.gguf', size: 8 },
          { rfilename: 'model-Q4_K_M.gguf', size: 4 },
        ],
      })
    }
    return new Response(new Uint8Array([1, 2, 3, 4]))
  }
  const manager = new LocalModelManager({ rootDir, fetchImpl, bundledModelRoots: [] })

  const record = await manager.download('acme/code-gguf')
  assert.equal(record.file, 'model-Q4_K_M.gguf')
  assert.equal(record.size, 4)
  assert.deepEqual([...await readFile(record.path)], [1, 2, 3, 4])
  assert.deepEqual((await manager.listDownloaded()).map(model => model.id), [record.id])
})

test('bundled offline starter is available without network access or copying', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const bundleRoot = path.join(rootDir, 'bundled-models')
  const modelRoot = path.join(bundleRoot, 'codeagent-offline-starter')
  const modelFile = 'starter-q4_0.gguf'
  const { mkdir } = await import('fs/promises')
  await mkdir(modelRoot, { recursive: true })
  await writeFile(path.join(modelRoot, modelFile), new Uint8Array([1, 2, 3]))
  await writeFile(path.join(bundleRoot, 'bundle.json'), JSON.stringify({
    schemaVersion: 1,
    models: [{
      id: 'codeagent-offline-starter',
      displayName: 'Offline starter',
      repository: 'Qwen/starter',
      revision: 'abc123',
      file: modelFile,
      sha256: 'unused-at-runtime',
      size: 3,
      quantization: 'Q4_0',
      license: 'Apache-2.0',
    }],
  }))
  const manager = new LocalModelManager({
    rootDir: path.join(rootDir, 'managed'),
    bundledModelRoots: [bundleRoot],
    fetchImpl: async () => { throw new Error('network should not be used') },
  })

  const models = await manager.listDownloaded()
  assert.equal(models.length, 1)
  assert.equal(models[0].source, 'bundled')
  assert.equal(models[0].repository, 'Qwen/starter')
  assert.equal((await manager.ensureModel('Qwen/starter')).path, path.join(modelRoot, modelFile))
})

test('start rejects non-loopback bindings before launching an engine', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const modelPath = path.join(rootDir, 'model.gguf')
  await writeFile(modelPath, new Uint8Array([1]))
  const manager = new LocalModelManager({ rootDir, bundledModelRoots: [] })
  await assert.rejects(
    manager.start({ model: modelPath, host: '0.0.0.0' }),
    /loopback/,
  )
})

test('readLog returns only recent llama.cpp output and hides missing paths', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const manager = new LocalModelManager({ rootDir, bundledModelRoots: [] })
  assert.deepEqual(await manager.readLog(2), { path: '', content: '' })
  await writeFile(manager.logPath, 'first\nsecond\nthird\n')
  assert.deepEqual(await manager.readLog(2), { path: manager.logPath, content: 'second\nthird' })
})

test('start reports spawn errors through the caller instead of an uncaught process error', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const modelPath = path.join(rootDir, 'model.gguf')
  await writeFile(modelPath, new Uint8Array([1]))
  const manager = new LocalModelManager({ rootDir, bundledModelRoots: [] })
  await assert.rejects(
    manager.start({ model: modelPath, enginePath: rootDir, port: 49199 }),
    /Failed to start/,
  )
})

test('engine installer reuses a bundled or managed llama.cpp executable', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'codeagent-model-test-'))
  const executable = path.join(rootDir, 'engine', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server')
  const { mkdir } = await import('fs/promises')
  await mkdir(path.dirname(executable), { recursive: true })
  await writeFile(executable, new Uint8Array([1]))
  const manager = new LocalModelManager({
    rootDir,
    bundledModelRoots: [],
    fetchImpl: async () => { throw new Error('network should not be used') },
  })

  const installed = await manager.installEngine()
  assert.equal(installed.installed, true)
  if (installed.source === 'bundled') {
    assert.match(path.basename(installed.path!), /^llama(?:-server)?(?:\.exe)?$/)
  } else {
    assert.equal(installed.path, executable)
  }
  assert.equal((await manager.engineInfo()).installed, true)
})
