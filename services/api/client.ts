import { randomUUID } from 'crypto'
import type { ClientOptions, LlmClient } from 'src/services/api/sdk.js'
import { logForDebugging } from '../../utils/debug.js'
import { createOpenAICompatibleClient } from './openaiCompatibleClient.js'

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

export async function getLlmProviderClient({
  maxRetries: _maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<LlmClient> {
  return createOpenAICompatibleClient({
    model,
    fetchOverride: buildFetch(fetchOverride, source),
  })
}

function buildFetch(
  fetchOverride: ClientOptions['fetch'],
  source: string | undefined,
): ClientOptions['fetch'] {
  const inner = fetchOverride ?? globalThis.fetch
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (!headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
    }
    try {
      const url = input instanceof Request ? input.url : String(input)
      const id = headers.get(CLIENT_REQUEST_ID_HEADER)
      logForDebugging(
        `[API REQUEST] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}`,
      )
    } catch {
      // Logging should never block request dispatch.
    }
    return inner(input, { ...init, headers })
  }
}
