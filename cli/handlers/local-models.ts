import { LocalModelManager } from '../../electron/services/local-model-service.js'

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export async function localModelsSearchHandler(query: string | undefined, options: { limit?: string }): Promise<void> {
  print(await new LocalModelManager().search(query, Number(options.limit ?? 20)))
}

export async function localModelsFilesHandler(repository: string): Promise<void> {
  print(await new LocalModelManager().listFiles(repository))
}

export async function localModelsDownloadHandler(repository: string, options: { file?: string }): Promise<void> {
  const manager = new LocalModelManager()
  const record = await manager.download(repository, options.file)
  print(record)
}

export async function localModelsListHandler(): Promise<void> {
  print(await new LocalModelManager().listDownloaded())
}

export async function localModelsInstallEngineHandler(): Promise<void> {
  print(await new LocalModelManager().installEngine())
}

export async function localModelsEngineInfoHandler(): Promise<void> {
  print(await new LocalModelManager().engineInfo())
}

export async function localModelsStartHandler(model: string, options: {
  enginePath?: string
  host?: string
  port?: string
  contextTokens?: string
  gpuLayers?: string
}): Promise<void> {
  const status = await new LocalModelManager().start({
    model,
    enginePath: options.enginePath,
    host: options.host,
    port: options.port === undefined ? undefined : Number(options.port),
    contextTokens: options.contextTokens === undefined ? undefined : Number(options.contextTokens),
    gpuLayers: options.gpuLayers === undefined ? undefined : Number(options.gpuLayers),
  })
  print({
    ...status,
    cli: `code-agent --llm-provider local --base-url ${status.baseUrl} --model ${JSON.stringify(status.model)}`,
  })
}

export async function localModelsStopHandler(): Promise<void> {
  print(await new LocalModelManager().stop())
}

export async function localModelsStatusHandler(): Promise<void> {
  print(await new LocalModelManager().status())
}
