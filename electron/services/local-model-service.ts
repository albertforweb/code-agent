import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, realpathSync, rmSync } from 'fs'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { createServer } from 'net'
import path from 'path'

const HUGGING_FACE_BASE_URL = 'https://huggingface.co'
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 14321
const DEFAULT_CONTEXT_TOKENS = 8192
export const CODEAGENT_LOCAL_BASE_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1`
export const CODEAGENT_OFFLINE_STARTER_MODEL = 'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF'

export interface HuggingFaceModel {
  id: string
  downloads: number
  likes: number
  lastModified?: string
  pipelineTag?: string
  tags: string[]
  gated: boolean | string
}

export interface HuggingFaceModelFile {
  name: string
  size?: number
  quantization?: string
}

export interface LocalModelRecord {
  id: string
  repository: string
  file: string
  path: string
  size: number
  downloadedAt: string
  source?: 'bundled' | 'downloaded'
  displayName?: string
  revision?: string
  sha256?: string
  license?: string
  quantization?: string
}

interface BundledModelManifest {
  schemaVersion: number
  models: Array<{
    id: string
    displayName: string
    repository: string
    revision: string
    file: string
    sha256: string
    size: number
    quantization: string
    license: string
  }>
}

export interface LocalInferenceStartOptions {
  model: string
  enginePath?: string
  host?: string
  port?: number
  contextTokens?: number
  gpuLayers?: number
}

export interface LocalInferenceStatus {
  running: boolean
  healthy: boolean
  pid?: number
  model?: string
  modelPath?: string
  baseUrl: string
  enginePath?: string
  startedAt?: string
  logPath: string
  error?: string
}

export interface LocalInferenceEngineInfo {
  installed: boolean
  path?: string
  version?: string
  source?: string
}

export interface LocalInferenceLog {
  path: string
  content: string
}

interface LocalInferenceState {
  pid: number
  model: string
  modelPath: string
  baseUrl: string
  enginePath: string
  startedAt: string
  ownerPid?: number
}

interface HuggingFaceModelPayload {
  id?: string
  modelId?: string
  downloads?: number
  likes?: number
  lastModified?: string
  pipeline_tag?: string
  tags?: string[]
  gated?: boolean | string
  siblings?: Array<{
    rfilename?: string
    size?: number
    lfs?: { size?: number }
  }>
}

interface GitHubReleasePayload {
  tag_name?: string
  assets?: Array<{
    name?: string
    browser_download_url?: string
    digest?: string | null
  }>
}

export class LocalModelManager {
  readonly rootDir: string
  readonly modelDir: string
  readonly statePath: string
  readonly logPath: string
  private readonly fetchImpl: typeof fetch
  private readonly bundledModelRoots?: string[]
  private configureQueue: Promise<void> = Promise.resolve()

  constructor(options: { rootDir?: string; fetchImpl?: typeof fetch; bundledModelRoots?: string[] } = {}) {
    this.rootDir = options.rootDir ?? getLocalModelRoot()
    this.modelDir = path.join(this.rootDir, 'models')
    this.statePath = path.join(this.rootDir, 'inference.json')
    this.logPath = path.join(this.rootDir, 'inference.log')
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.bundledModelRoots = options.bundledModelRoots
  }

  async search(query = '', limit = 20): Promise<HuggingFaceModel[]> {
    const url = new URL('/api/models', HUGGING_FACE_BASE_URL)
    if (query.trim()) url.searchParams.set('search', query.trim())
    url.searchParams.set('filter', 'gguf')
    url.searchParams.set('sort', 'downloads')
    url.searchParams.set('direction', '-1')
    url.searchParams.set('limit', String(clamp(limit, 1, 100)))
    url.searchParams.set('full', 'true')

    const response = await this.huggingFaceFetch(url)
    const payload = await response.json() as HuggingFaceModelPayload[]
    return payload
      .filter(model => (model.id || model.modelId) && (model.gated === false || model.gated === undefined))
      .map(model => ({
        id: model.id ?? model.modelId!,
        downloads: model.downloads ?? 0,
        likes: model.likes ?? 0,
        lastModified: model.lastModified,
        pipelineTag: model.pipeline_tag,
        tags: model.tags ?? [],
        gated: model.gated ?? false,
      }))
  }

  async listFiles(repository: string): Promise<HuggingFaceModelFile[]> {
    validateRepositoryId(repository)
    const response = await this.huggingFaceFetch(
      new URL(`/api/models/${encodeRepositoryId(repository)}?blobs=true`, HUGGING_FACE_BASE_URL),
    )
    const payload = await response.json() as HuggingFaceModelPayload
    return (payload.siblings ?? [])
      .filter(file => file.rfilename?.toLowerCase().endsWith('.gguf'))
      .map(file => ({
        name: file.rfilename!,
        size: file.size ?? file.lfs?.size,
        quantization: inferQuantization(file.rfilename!),
      }))
      .sort((left, right) => (left.size ?? Number.MAX_SAFE_INTEGER) - (right.size ?? Number.MAX_SAFE_INTEGER))
  }

  async download(repository: string, file?: string): Promise<LocalModelRecord> {
    validateRepositoryId(repository)
    const files = await this.listFiles(repository)
    const selected = file
      ? files.find(candidate => candidate.name === file)
      : chooseDefaultGguf(files)
    if (!selected) {
      throw new Error(file
        ? `GGUF file not found in ${repository}: ${file}`
        : `${repository} does not expose a downloadable GGUF file.`)
    }

    await mkdir(this.modelDir, { recursive: true })
    const repositoryDir = path.join(this.modelDir, safeSegment(repository))
    await mkdir(repositoryDir, { recursive: true })
    const destination = path.join(repositoryDir, path.basename(selected.name))
    const partial = `${destination}.part`
    const url = new URL(
      `/${encodeRepositoryId(repository)}/resolve/main/${encodeFilePath(selected.name)}?download=true`,
      HUGGING_FACE_BASE_URL,
    )
    const response = await this.huggingFaceFetch(url)
    if (!response.body) throw new Error('Hugging Face returned an empty download body.')

    await rm(partial, { force: true })
    await writeWebStream(response.body, partial)
    await rename(partial, destination)
    const downloaded = await stat(destination)
    const record: LocalModelRecord = {
      id: `${repository}:${selected.name}`,
      repository,
      file: selected.name,
      path: destination,
      size: downloaded.size,
      downloadedAt: new Date().toISOString(),
      source: 'downloaded',
    }
    await this.writeModelMetadata(repositoryDir, record)
    return record
  }

  async listDownloaded(): Promise<LocalModelRecord[]> {
    const bundled = findBundledModels(this.bundledModelRoots)
    if (!existsSync(this.modelDir)) return bundled
    const { readdir } = await import('fs/promises')
    const entries = await readdir(this.modelDir, { withFileTypes: true })
    const records: LocalModelRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const parsed = JSON.parse(await readFile(path.join(this.modelDir, entry.name, 'model.json'), 'utf8'))
        if (parsed?.path && existsSync(parsed.path)) records.push({ ...parsed, source: 'downloaded' } as LocalModelRecord)
      } catch {
        // Ignore incomplete downloads and legacy folders without metadata.
      }
    }
    const bundledIds = new Set(bundled.flatMap(model => [model.id, model.path]))
    return [
      ...bundled,
      ...records
        .filter(model => !bundledIds.has(model.id) && !bundledIds.has(model.path))
        .sort((left, right) => right.downloadedAt.localeCompare(left.downloadedAt)),
    ]
  }

  async ensureModel(repository: string): Promise<LocalModelRecord> {
    const downloaded = await this.listDownloaded()
    return downloaded.find(model => model.repository === repository || model.id === repository)
      ?? this.download(repository)
  }

  async ensureConfigured(options: LocalInferenceStartOptions): Promise<LocalInferenceStatus> {
    const operation = this.configureQueue.then(async () => {
      await this.ensureModel(options.model)
      return this.start(options)
    })
    this.configureQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  async installEngine(): Promise<LocalInferenceEngineInfo> {
    const bundled = findBundledEngine()
    if (bundled) return { installed: true, path: bundled, source: 'bundled' }
    const existing = findManagedEngine(this.rootDir)
    if (existing) return { installed: true, path: existing, source: 'managed' }

    const response = await this.fetchImpl('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CodeAgent-local-inference' },
    })
    if (!response.ok) throw new Error(`Unable to resolve the latest llama.cpp release (${response.status}).`)
    const release = await response.json() as GitHubReleasePayload
    const assetName = getLlamaCppAssetName(release.tag_name)
    const asset = release.assets?.find(candidate => candidate.name === assetName)
    if (!asset?.browser_download_url) throw new Error(`llama.cpp does not publish ${assetName} for this platform.`)

    const engineDir = path.join(this.rootDir, 'engine')
    const archivePath = path.join(this.rootDir, assetName)
    await mkdir(this.rootDir, { recursive: true })
    await rm(engineDir, { recursive: true, force: true })
    await mkdir(engineDir, { recursive: true })
    const archiveResponse = await this.fetchImpl(asset.browser_download_url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'CodeAgent-local-inference' },
      redirect: 'follow',
    })
    if (!archiveResponse.ok || !archiveResponse.body) {
      throw new Error(`Unable to download llama.cpp ${release.tag_name ?? ''} (${archiveResponse.status}).`)
    }
    await rm(archivePath, { force: true })
    await writeWebStream(archiveResponse.body, archivePath)

    if (asset.digest?.startsWith('sha256:')) {
      const expected = asset.digest.slice('sha256:'.length).toLowerCase()
      const actual = await sha256File(archivePath)
      if (actual !== expected) {
        await rm(archivePath, { force: true })
        throw new Error(`llama.cpp archive checksum mismatch: expected ${expected}, received ${actual}.`)
      }
    }

    extractArchive(archivePath, engineDir)
    await rm(archivePath, { force: true })
    const executable = findManagedEngine(this.rootDir)
    if (!executable) throw new Error('The llama.cpp archive did not contain a supported inference executable.')
    if (process.platform !== 'win32') await chmod(executable, 0o755)
    await writeFile(path.join(engineDir, 'engine.json'), `${JSON.stringify({ version: release.tag_name, asset: assetName }, null, 2)}\n`, 'utf8')
    return { installed: true, path: executable, version: release.tag_name, source: asset.browser_download_url }
  }

  async engineInfo(): Promise<LocalInferenceEngineInfo> {
    const bundled = findBundledEngine()
    if (bundled) return { installed: true, path: bundled, source: 'bundled' }
    const managed = findManagedEngine(this.rootDir)
    if (managed) {
      try {
        const metadata = JSON.parse(await readFile(path.join(this.rootDir, 'engine', 'engine.json'), 'utf8'))
        return { installed: true, path: managed, version: metadata.version, source: 'managed' }
      } catch {
        return { installed: true, path: managed, source: 'managed' }
      }
    }
    const discovered = resolveEnginePathOnly(this.rootDir)
    return { installed: Boolean(discovered), path: discovered, source: discovered ? 'PATH' : undefined }
  }

  async start(options: LocalInferenceStartOptions): Promise<LocalInferenceStatus> {
    const current = await this.status()
    if (current.running) {
      if (current.model === options.model || current.modelPath === options.model) {
        const state = await this.readState()
        if (state) await this.writeState({ ...state, ownerPid: process.pid })
        return this.status()
      }
      await this.stop()
    }

    const model = await this.resolveModel(options.model)
    const host = options.host?.trim() || DEFAULT_HOST
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      throw new Error('The managed local inference engine only binds to the loopback interface.')
    }
    const engine = resolveEngine(options.enginePath, this.rootDir)
    const port = clamp(options.port ?? DEFAULT_PORT, 1, 65535)
    const contextTokens = clamp(options.contextTokens ?? DEFAULT_CONTEXT_TOKENS, 512, 1_048_576)
    const baseUrl = `http://${host === '::1' ? '[::1]' : host}:${port}/v1`
    await assertPortAvailable(host, port)
    const args = buildEngineArgs(engine, model, options.model, host, port, contextTokens, options.gpuLayers)

    await mkdir(this.rootDir, { recursive: true })
    const { openSync, closeSync } = await import('fs')
    const logFd = openSync(this.logPath, 'a')
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(engine.path, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        windowsHide: true,
      })
      await new Promise<void>((resolve, reject) => {
        const handleSpawn = () => {
          child.off('error', handleError)
          resolve()
        }
        const handleError = (error: Error) => {
          child.off('spawn', handleSpawn)
          reject(error)
        }
        child.once('spawn', handleSpawn)
        child.once('error', handleError)
      })
      // A detached child can still emit a later process error. Keep it handled so
      // Electron reports failures through the settings flow instead of a native dialog.
      child.on('error', () => undefined)
      child.unref()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start ${engine.path}: ${detail}`)
    } finally {
      closeSync(logFd)
    }
    if (!child.pid) throw new Error(`Failed to start ${engine.path}.`)

    const state: LocalInferenceState = {
      pid: child.pid,
      model: options.model,
      modelPath: model.path,
      baseUrl,
      enginePath: engine.path,
      startedAt: new Date().toISOString(),
      ownerPid: process.pid,
    }
    await this.writeState(state)

    const ready = await waitForHealth(baseUrl, this.fetchImpl, 60_000)
    if (!ready) {
      await this.stop().catch(() => undefined)
      throw new Error(`Local inference did not become ready. Check ${this.logPath}.`)
    }
    return this.status()
  }

  async stop(): Promise<LocalInferenceStatus> {
    const state = await this.readState()
    if (state && isPidAlive(state.pid)) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { windowsHide: true })
      } else {
        try { process.kill(-state.pid, 'SIGTERM') } catch { process.kill(state.pid, 'SIGTERM') }
      }
    }
    await rm(this.statePath, { force: true })
    return this.status()
  }

  shutdownSync(): void {
    try {
      const state = JSON.parse(readFileSync(this.statePath, 'utf8')) as LocalInferenceState
      if (state.ownerPid !== undefined && state.ownerPid !== process.pid) return
      stopStateProcess(state)
      rmSync(this.statePath, { force: true })
    } catch {
      // Missing state means this process does not own a managed server.
    }
  }

  async status(): Promise<LocalInferenceStatus> {
    const state = await this.readState()
    const running = Boolean(state && isPidAlive(state.pid))
    if (!running && state) await rm(this.statePath, { force: true })
    const baseUrl = state?.baseUrl ?? `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1`
    return {
      running,
      healthy: running ? await checkHealth(baseUrl, this.fetchImpl) : false,
      pid: running ? state?.pid : undefined,
      model: running ? state?.model : undefined,
      modelPath: running ? state?.modelPath : undefined,
      baseUrl,
      enginePath: running ? state?.enginePath : resolveEnginePathOnly(this.rootDir),
      startedAt: running ? state?.startedAt : undefined,
      logPath: this.logPath,
    }
  }

  async readLog(tailLines = 80): Promise<LocalInferenceLog> {
    const limit = clamp(tailLines, 1, 500)
    try {
      const content = await readFile(this.logPath, 'utf8')
      return { path: this.logPath, content: content.trimEnd().split(/\r?\n/).slice(-limit).join('\n').trim() }
    } catch {
      return { path: '', content: '' }
    }
  }

  private async resolveModel(value: string): Promise<LocalModelRecord> {
    const resolvedPath = path.resolve(value)
    if (existsSync(resolvedPath) && resolvedPath.toLowerCase().endsWith('.gguf')) {
      const info = await stat(resolvedPath)
      return {
        id: path.basename(resolvedPath, path.extname(resolvedPath)),
        repository: 'local',
        file: path.basename(resolvedPath),
        path: resolvedPath,
        size: info.size,
        downloadedAt: info.mtime.toISOString(),
      }
    }
    const models = await this.listDownloaded()
    const match = models.find(model => model.id === value || model.repository === value || model.file === value)
    if (!match) throw new Error(`Downloaded model not found: ${value}`)
    return match
  }

  private async readState(): Promise<LocalInferenceState | undefined> {
    try { return JSON.parse(await readFile(this.statePath, 'utf8')) as LocalInferenceState } catch { return undefined }
  }

  private async writeState(state: LocalInferenceState): Promise<void> {
    await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  }

  private async writeModelMetadata(directory: string, record: LocalModelRecord): Promise<void> {
    await writeFile(path.join(directory, 'model.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  }

  private async huggingFaceFetch(url: URL): Promise<Response> {
    const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`Hugging Face request failed (${response.status}): ${await response.text()}`)
    }
    return response
  }
}

export function getLocalModelRoot(): string {
  const configDir = process.env.CODEAGENT_CONFIG_DIR ?? process.env.CODE_AGENT_CONFIG_DIR
  return path.join(configDir || path.join(homedir(), '.code-agent'), 'local-models')
}

function validateRepositoryId(repository: string): void {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Invalid Hugging Face repository ID: ${repository}`)
}

function encodeRepositoryId(repository: string): string {
  return repository.split('/').map(encodeURIComponent).join('/')
}

function encodeFilePath(file: string): string {
  return file.split('/').map(encodeURIComponent).join('/')
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '--')
}

function inferQuantization(file: string): string | undefined {
  return file.match(/(?:^|[-_.])(Q\d(?:_[A-Z0-9]+)+)(?:[-_.]|\.gguf$)/i)?.[1]?.toUpperCase()
}

function chooseDefaultGguf(files: HuggingFaceModelFile[]): HuggingFaceModelFile | undefined {
  return files.find(file => /Q4_K_M/i.test(file.name))
    ?? files.find(file => /Q4/i.test(file.name))
    ?? files[0]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(value)))
}

async function writeWebStream(stream: ReadableStream<Uint8Array>, destination: string): Promise<void> {
  const output = createWriteStream(destination, { flags: 'wx' })
  const reader = stream.getReader()
  let outputError: Error | undefined
  output.once('error', error => { outputError = error })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (outputError) throw outputError
      if (!output.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            output.removeListener('drain', onDrain)
            output.removeListener('error', onError)
          }
          const onDrain = () => { cleanup(); resolve() }
          const onError = (error: Error) => { cleanup(); reject(error) }
          output.once('drain', onDrain)
          output.once('error', onError)
        })
      }
    }
    if (outputError) throw outputError
    await new Promise<void>((resolve, reject) => {
      output.once('error', reject)
      output.end(resolve)
    })
  } catch (error) {
    output.destroy()
    await rm(destination, { force: true })
    throw error
  } finally {
    reader.releaseLock()
  }
}

function resolveEngine(explicit: string | undefined, rootDir: string): { path: string; subcommand: boolean } {
  const explicitCandidate = explicit?.trim()
  const environmentCandidate = process.env.CODEAGENT_LLAMA_SERVER_PATH?.trim()
  const candidate = (explicitCandidate && existsSync(explicitCandidate) ? explicitCandidate : undefined)
    || (environmentCandidate && existsSync(environmentCandidate) ? environmentCandidate : undefined)
    || findBundledEngine()
    || resolveEnginePathOnly(rootDir)
  if (!candidate) {
    throw new Error('llama.cpp was not found. Choose Install engine, run `code-agent models install-engine`, or provide --engine-path.')
  }
  const basename = path.basename(candidate).toLowerCase()
  return { path: candidate, subcommand: basename === 'llama' || basename === 'llama.exe' }
}

function resolveEnginePathOnly(rootDir?: string): string | undefined {
  const bundled = findBundledEngine()
  if (bundled) return bundled
  const managed = rootDir ? findManagedEngine(rootDir) : undefined
  if (managed) return managed
  for (const command of ['llama-server', 'llama']) {
    const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8', windowsHide: true })
    const found = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : ''
    if (found) return found
  }
  return undefined
}

function findBundledEngine(): string | undefined {
  const platformArch = `${process.platform}-${process.arch}`
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const entrypointDir = getRuntimeEntrypointDir()
  const roots = [
    resourcesPath ? path.join(resourcesPath, 'llama.cpp') : undefined,
    path.resolve(entrypointDir, '../resources/llama.cpp'),
    path.resolve(entrypointDir, '../../resources/llama.cpp'),
    path.resolve(process.cwd(), 'electron/resources/llama.cpp'),
  ].filter((value): value is string => Boolean(value))
  for (const root of roots) {
    const found = findEngineBelow(path.join(root, platformArch)) ?? findEngineBelow(root)
    if (found) return found
  }
  return undefined
}

function findBundledModels(overrideRoots?: string[]): LocalModelRecord[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const entrypointDir = getRuntimeEntrypointDir()
  const roots = overrideRoots ?? [
    resourcesPath ? path.join(resourcesPath, 'models') : undefined,
    path.resolve(entrypointDir, '../resources/models'),
    path.resolve(entrypointDir, '../../resources/models'),
    path.resolve(process.cwd(), 'electron/resources/models'),
    path.resolve(process.cwd(), 'dist/resources/models'),
  ].filter((value): value is string => Boolean(value))

  for (const root of roots) {
    const manifestPath = path.join(root, 'bundle.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BundledModelManifest
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.models)) continue
      return manifest.models.flatMap(model => {
        const modelPath = path.join(root, model.id, model.file)
        if (!existsSync(modelPath)) return []
        return [{
          id: `${model.repository}:${model.file}`,
          repository: model.repository,
          file: model.file,
          path: modelPath,
          size: model.size,
          downloadedAt: new Date(0).toISOString(),
          source: 'bundled' as const,
          displayName: model.displayName,
          revision: model.revision,
          sha256: model.sha256,
          license: model.license,
          quantization: model.quantization,
        }]
      })
    } catch {
      // Ignore malformed manifests and continue to another runtime root.
    }
  }
  return []
}

function getRuntimeEntrypointDir(): string {
  if (!process.argv[1]) return process.cwd()
  try { return path.dirname(realpathSync(process.argv[1])) } catch { return path.dirname(path.resolve(process.argv[1])) }
}

function findManagedEngine(rootDir: string): string | undefined {
  return findEngineBelow(path.join(rootDir, 'engine'))
}

function findEngineBelow(engineRoot: string): string | undefined {
  if (!existsSync(engineRoot)) return undefined
  const serverName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const unifiedName = process.platform === 'win32' ? 'llama.exe' : 'llama'
  let unified: string | undefined
  const pending = [engineRoot]
  while (pending.length > 0) {
    const directory = pending.shift()!
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      if (entry.isDirectory()) pending.push(candidate)
      else if (entry.isFile() && entry.name.toLowerCase() === serverName) return candidate
      else if (entry.isFile() && entry.name.toLowerCase() === unifiedName) unified ??= candidate
    }
  }
  return unified
}

function getLlamaCppAssetName(version?: string): string {
  if (!version) throw new Error('The latest llama.cpp release does not have a version tag.')
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : undefined
  if (!arch) throw new Error(`llama.cpp automatic installation does not support ${process.arch}.`)
  if (process.platform === 'darwin') return `llama-${version}-bin-macos-${arch}.tar.gz`
  if (process.platform === 'linux') return `llama-${version}-bin-ubuntu-${arch}.tar.gz`
  if (process.platform === 'win32') return `llama-${version}-bin-win-cpu-${arch}.zip`
  throw new Error(`llama.cpp automatic installation does not support ${process.platform}.`)
}

function extractArchive(archivePath: string, destination: string): void {
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }',
      archivePath,
      destination,
    ], { windowsHide: true, encoding: 'utf8' })
    : spawnSync('tar', ['-xzf', archivePath, '-C', destination], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Unable to extract llama.cpp: ${result.stderr || result.stdout}`)
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function buildEngineArgs(
  engine: { path: string; subcommand: boolean },
  model: LocalModelRecord,
  alias: string,
  host: string,
  port: number,
  contextTokens: number,
  gpuLayers?: number,
): string[] {
  return [
    ...(engine.subcommand ? ['serve'] : []),
    '--model', model.path,
    '--alias', alias,
    '--host', host,
    '--port', String(port),
    '--ctx-size', String(contextTokens),
    '--jinja',
    ...(gpuLayers === undefined ? [] : ['--gpu-layers', String(Math.floor(gpuLayers))]),
  ]
}

function stopStateProcess(state: LocalInferenceState): void {
  if (!isPidAlive(state.pid)) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { windowsHide: true })
  } else {
    try { process.kill(-state.pid, 'SIGTERM') } catch { process.kill(state.pid, 'SIGTERM') }
  }
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function checkHealth(baseUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/v1\/?$/, '')}/health`, { signal: AbortSignal.timeout(1500) })
    if (response.ok) return true
    const models = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/models`, { signal: AbortSignal.timeout(1500) })
    return models.ok
  } catch {
    return false
  }
}

async function waitForHealth(baseUrl: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await checkHealth(baseUrl, fetchImpl)) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

async function assertPortAvailable(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', error => reject(new Error(`CodeAgent inference port ${host}:${port} is unavailable: ${error.message}`)))
    server.listen({ host, port, exclusive: true }, () => server.close(closeError => closeError ? reject(closeError) : resolve()))
  })
}
