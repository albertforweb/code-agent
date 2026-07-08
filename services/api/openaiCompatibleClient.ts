import type LlmClient from 'src/services/api/sdk.js'
import type { ClientOptions } from 'src/services/api/sdk.js'
import { Stream } from 'src/services/api/sdk.js'
import { randomUUID } from 'crypto'
import {
  getOpenAICompatibleMaxOutputTokens,
  getOpenAICompatibleProviderKind,
  shouldSendOpenAICompatibleTools,
  type OpenAIProviderKind,
} from 'src/utils/model/openaiCompatible.js'
import { logForDebugging } from '../../utils/debug.js'
import { EMPTY_USAGE } from './emptyUsage.js'

type OpenAICompatibleClientOptions = {
  model?: string
  fetchOverride?: ClientOptions['fetch']
}

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

const DEFAULT_BASE_URLS: Record<OpenAIProviderKind, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
}

const DEFAULT_MODELS: Record<OpenAIProviderKind, string> = {
  openai: 'gpt-4o-mini',
  'openai-compatible': 'local-model',
}

export function createOpenAICompatibleClient({
  model,
  fetchOverride,
}: OpenAICompatibleClientOptions): LlmClient {
  const messages = {
    create: (params: Record<string, any>, options?: Record<string, any>) =>
      createRequest(params, options, { model, fetchOverride }),
    countTokens: async (params: Record<string, any>) => ({
      input_tokens: estimateRequestTokens(params),
    }),
  }

  const client = {
    beta: { messages },
    messages,
    models: {
      list: async function* () {
        yield {
          id: resolveModel(model),
          type: 'model',
          display_name: resolveModel(model),
          created_at: new Date(0).toISOString(),
        }
      },
    },
  }

  return client as unknown as LlmClient
}

function createRequest(
  params: Record<string, any>,
  options: Record<string, any> | undefined,
  clientOptions: OpenAICompatibleClientOptions,
): Promise<any> & {
  withResponse: () => Promise<{
    data: any
    response: Response
    request_id: string | null
  }>
  asResponse: () => Promise<Response>
} {
  let pending:
    | Promise<{ data: any; response: Response; request_id: string | null }>
    | undefined
  const execute = () => {
    pending ??= executeRequest(params, options, clientOptions)
    return pending
  }
  const dataPromise = () => execute().then(result => result.data)
  const promise = {
    then: (onFulfilled: any, onRejected: any) =>
      dataPromise().then(onFulfilled, onRejected),
    catch: (onRejected: any) => dataPromise().catch(onRejected),
    finally: (onFinally: any) => dataPromise().finally(onFinally),
    [Symbol.toStringTag]: 'Promise',
  } as Promise<any> & {
    withResponse: () => Promise<{
      data: any
      response: Response
      request_id: string | null
    }>
    asResponse: () => Promise<Response>
  }

  promise.withResponse = execute
  promise.asResponse = async () => (await execute()).response

  return promise
}

async function executeRequest(
  params: Record<string, any>,
  options: Record<string, any> | undefined,
  clientOptions: OpenAICompatibleClientOptions,
): Promise<{ data: any; response: Response; request_id: string | null }> {
  const fetchImpl = clientOptions.fetchOverride ?? globalThis.fetch
  const controller = new AbortController()
  const signal = mergeAbortSignals(controller, options?.signal)
  const body = buildChatCompletionPayload(params, clientOptions.model)
  const url = getChatCompletionsUrl()

  logForDebugging(
    `[OpenAI-compatible] POST ${url} model=${body.model} stream=${body.stream === true}`,
  )

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `code-agent-cli/${MACRO.VERSION}`,
      ...getAuthHeaders(),
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `OpenAI-compatible API error: ${await formatOpenAIError(response)}`,
    )
  }

  const requestId =
    response.headers.get('x-request-id') ??
    response.headers.get('x-openai-request-id')

  if (params.stream) {
    return {
      data: createLlmProviderEventStream(response, controller, body.model),
      response,
      request_id: requestId,
    }
  }

  const data = await response.json()
  return {
    data: toLlmProviderMessage(data, body.model),
    response,
    request_id: requestId ?? data?.id ?? null,
  }
}

function buildChatCompletionPayload(
  params: Record<string, any>,
  fallbackModel?: string,
): Record<string, any> {
  const sendTools = shouldSendOpenAICompatibleTools()
  const tools = sendTools ? toOpenAITools(params.tools) : []
  if (!sendTools && Array.isArray(params.tools) && params.tools.length > 0) {
    logForDebugging(
      `[OpenAI-compatible] tool schemas omitted for local context budget (${params.tools.length} available)`,
    )
  }

  const maxTokens = capMaxTokens(params.max_tokens)
  const payload: Record<string, any> = {
    model: resolveModel(params.model ?? fallbackModel),
    messages: toOpenAIMessages(params),
    stream: params.stream === true,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(typeof params.temperature === 'number'
      ? { temperature: params.temperature }
      : {}),
    ...(tools.length > 0 ? { tools, tool_choice: toOpenAIToolChoice(params.tool_choice) } : {}),
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  )
}

function capMaxTokens(value: unknown): number | undefined {
  const cap = getOpenAICompatibleMaxOutputTokens()
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return cap
  }
  return Math.max(1, Math.min(Math.floor(value), cap))
}

function toOpenAIMessages(params: Record<string, any>): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = []
  const system = contentToText(params.system)
  if (system) {
    messages.push({ role: 'system', content: system })
  }

  for (const message of params.messages ?? []) {
    if (message?.role === 'assistant') {
      const { text, toolCalls } = assistantContentToOpenAI(message.content)
      messages.push({
        role: 'assistant',
        content: text || (toolCalls.length > 0 ? null : ''),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      })
      continue
    }

    if (message?.role === 'user') {
      const converted = userContentToOpenAI(message.content)
      if (converted.length > 0) {
        messages.push(...converted)
      }
    }
  }

  return messages
}

function userContentToOpenAI(content: unknown): OpenAIChatMessage[] {
  if (typeof content === 'string') {
    return [{ role: 'user', content }]
  }
  if (!Array.isArray(content)) {
    return [{ role: 'user', content: contentToText(content) }]
  }

  const result: OpenAIChatMessage[] = []
  let textParts: string[] = []
  const flushText = () => {
    const text = textParts.join('\n\n').trim()
    if (text) result.push({ role: 'user', content: text })
    textParts = []
  }

  for (const block of content) {
    if (block?.type === 'tool_result') {
      flushText()
      result.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: contentToText(block.content),
      })
    } else {
      const text = contentToText(block)
      if (text) textParts.push(text)
    }
  }
  flushText()

  return result
}

function assistantContentToOpenAI(content: unknown): {
  text: string
  toolCalls: OpenAIToolCall[]
} {
  if (typeof content === 'string') {
    return { text: content, toolCalls: [] }
  }
  if (!Array.isArray(content)) {
    return { text: contentToText(content), toolCalls: [] }
  }

  const textParts: string[] = []
  const toolCalls: OpenAIToolCall[] = []
  for (const block of content) {
    if (block?.type === 'tool_use') {
      toolCalls.push({
        id: block.id ?? `call_${randomUUID()}`,
        type: 'function',
        function: {
          name: block.name,
          arguments:
            typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input ?? {}),
        },
      })
    } else {
      const text = contentToText(block)
      if (text) textParts.push(text)
    }
  }

  return { text: textParts.join('\n\n'), toolCalls }
}

function contentToText(content: unknown): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(contentToText).filter(Boolean).join('\n\n')
  }
  if (typeof content === 'object') {
    const block = content as Record<string, any>
    switch (block.type) {
      case 'text':
        return block.text ?? ''
      case 'tool_result':
        return contentToText(block.content)
      case 'image':
        return '[image omitted]'
      case 'document':
        return block.title ? `[document omitted: ${block.title}]` : '[document omitted]'
      case 'thinking':
      case 'redacted_thinking':
        return ''
      default:
        if (typeof block.text === 'string') return block.text
        return ''
    }
  }
  return String(content)
}

function toOpenAITools(tools: unknown): Array<Record<string, any>> {
  if (!Array.isArray(tools)) return []
  return tools
    .filter(tool => tool?.name && tool?.input_schema)
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.input_schema,
      },
    }))
}

function toOpenAIToolChoice(choice: Record<string, any> | undefined): unknown {
  if (!choice?.type) return 'auto'
  switch (choice.type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'disabled':
      return 'none'
    case 'tool': {
      const name = choice.name ?? choice.id
      return name
        ? { type: 'function', function: { name } }
        : 'auto'
    }
    default:
      return 'auto'
  }
}

function toLlmProviderMessage(data: Record<string, any>, fallbackModel: string) {
  const choice = data?.choices?.[0] ?? {}
  const message = choice.message ?? {}
  const content = toLlmProviderContentBlocks(message)
  const stopReason = toLlmProviderStopReason(choice.finish_reason, content)

  return {
    id: data.id ?? `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: data.model ?? fallbackModel,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: toLlmProviderUsage(data.usage),
  }
}

function toLlmProviderContentBlocks(message: Record<string, any>): any[] {
  const blocks: any[] = []
  if (typeof message.content === 'string' && message.content.length > 0) {
    blocks.push({ type: 'text', text: message.content })
  }

  for (const toolCall of message.tool_calls ?? []) {
    const args = toolCall.function?.arguments
    blocks.push({
      type: 'tool_use',
      id: toolCall.id ?? `call_${randomUUID()}`,
      name: toolCall.function?.name ?? 'unknown_tool',
      input: parseToolArguments(args),
    })
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: '' })
  }
  return blocks
}

function createLlmProviderEventStream(
  response: Response,
  controller: AbortController,
  model: string,
): Stream<any> {
  async function* iterator() {
    const messageId = `msg_${randomUUID()}`
    const usage = { ...EMPTY_USAGE }
    let finalStopReason: string | null = 'end_turn'
    let textBlockStarted = false
    let textBlockIndex: number | null = null
    let nextBlockIndex = 0
    const toolStates = new Map<
      number,
      {
        blockIndex: number
        id: string
        name: string
        started: boolean
      }
    >()

    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage,
      },
    }

    for await (const payload of iterateOpenAIStream(response, controller)) {
      const choice = payload?.choices?.[0]
      if (payload?.usage) {
        Object.assign(usage, toLlmProviderUsage(payload.usage))
      }
      if (!choice) continue

      if (choice.finish_reason) {
        finalStopReason = toLlmProviderStopReason(choice.finish_reason)
      }

      const delta = choice.delta ?? {}
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        if (!textBlockStarted) {
          textBlockIndex = nextBlockIndex++
          textBlockStarted = true
          yield {
            type: 'content_block_start',
            index: textBlockIndex,
            content_block: { type: 'text', text: '' },
          }
        }
        yield {
          type: 'content_block_delta',
          index: textBlockIndex,
          delta: { type: 'text_delta', text: delta.content },
        }
      }

      for (const toolCallDelta of delta.tool_calls ?? []) {
        const toolIndex = toolCallDelta.index ?? 0
        let state = toolStates.get(toolIndex)
        if (!state) {
          state = {
            blockIndex: nextBlockIndex++,
            id: toolCallDelta.id ?? `call_${randomUUID()}`,
            name: toolCallDelta.function?.name ?? '',
            started: false,
          }
          toolStates.set(toolIndex, state)
        }

        if (toolCallDelta.id) state.id = toolCallDelta.id
        if (toolCallDelta.function?.name) state.name = toolCallDelta.function.name

        const partialJson = toolCallDelta.function?.arguments
        if (!state.started && (state.name || partialJson)) {
          state.started = true
          yield {
            type: 'content_block_start',
            index: state.blockIndex,
            content_block: {
              type: 'tool_use',
              id: state.id,
              name: state.name || 'unknown_tool',
              input: {},
            },
          }
        }

        if (typeof partialJson === 'string' && partialJson.length > 0) {
          yield {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: { type: 'input_json_delta', partial_json: partialJson },
          }
        }
      }
    }

    if (textBlockStarted && textBlockIndex !== null) {
      yield { type: 'content_block_stop', index: textBlockIndex }
    }
    for (const state of toolStates.values()) {
      if (!state.started) {
        yield {
          type: 'content_block_start',
          index: state.blockIndex,
          content_block: {
            type: 'tool_use',
            id: state.id,
            name: state.name || 'unknown_tool',
            input: {},
          },
        }
      }
      yield { type: 'content_block_stop', index: state.blockIndex }
    }

    yield {
      type: 'message_delta',
      delta: { stop_reason: finalStopReason, stop_sequence: null },
      usage,
    }
    yield { type: 'message_stop' }
  }

  return new Stream(iterator, controller)
}

async function* iterateOpenAIStream(
  response: Response,
  controller: AbortController,
): AsyncGenerator<Record<string, any>> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''
  let done = false

  try {
    while (!done) {
      const result = await reader.read()
      done = result.done
      buffer += decoder.decode(result.value ?? new Uint8Array(), {
        stream: !done,
      })

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const parsed = parseOpenAIStreamLine(line)
        if (parsed === '[DONE]') return
        if (parsed) yield parsed
      }
    }

    const trailing = parseOpenAIStreamLine(buffer)
    if (trailing && trailing !== '[DONE]') {
      yield trailing
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return
    throw error
  } finally {
    if (!done) {
      controller.abort()
    }
  }
}

function parseOpenAIStreamLine(line: string): Record<string, any> | '[DONE]' | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed
  if (!payload) return null
  if (payload === '[DONE]') return '[DONE]'
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function toLlmProviderStopReason(
  finishReason: string | null | undefined,
  content?: any[],
): string | null {
  if (content?.some(block => block.type === 'tool_use')) return 'tool_use'
  switch (finishReason) {
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content_filter':
      return 'stop_sequence'
    case 'stop':
    case null:
    case undefined:
      return 'end_turn'
    default:
      return 'end_turn'
  }
}

function toLlmProviderUsage(usage: Record<string, any> | undefined) {
  return {
    ...EMPTY_USAGE,
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
  }
}

function parseToolArguments(args: unknown): unknown {
  if (typeof args !== 'string' || args.trim() === '') return {}
  try {
    return JSON.parse(args)
  } catch {
    return { input: args }
  }
}

function estimateRequestTokens(params: Record<string, any>): number {
  const text = [
    contentToText(params.system),
    ...(params.messages ?? []).map((message: Record<string, any>) =>
      contentToText(message.content),
    ),
    JSON.stringify(params.tools ?? []),
  ].join('\n')
  return Math.max(1, Math.ceil(text.length / 4))
}

function resolveModel(model?: string): string {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  const envModel = firstDefined(
    process.env.CODE_AGENT_MODEL,
    process.env.OPENAI_COMPATIBLE_MODEL,
    process.env.OPENAI_MODEL,
  )
  if (envModel) return envModel

  if (model && !model.toLowerCase().includes('codeAgent-')) {
    return model
  }

  return DEFAULT_MODELS[provider]
}

function getChatCompletionsUrl(): string {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  const baseUrl =
    firstDefined(
      process.env.CODE_AGENT_BASE_URL,
      process.env.CODE_AGENT_LLM_BASE_URL,
      process.env.OPENAI_COMPATIBLE_BASE_URL,
      process.env.OPENAI_BASE_URL,
    ) ?? DEFAULT_BASE_URLS[provider]

  if (baseUrl.endsWith('/chat/completions')) {
    return baseUrl
  }
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

function getAuthHeaders(): Record<string, string> {
  const apiKey = firstDefined(
    process.env.CODE_AGENT_API_KEY,
    process.env.OPENAI_COMPATIBLE_API_KEY,
    process.env.OPENAI_API_KEY,
  )
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function formatOpenAIError(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `${response.status} ${response.statusText}`
  try {
    const data = JSON.parse(text)
    return data.error?.message || text
  } catch {
    return text
  }
}

function mergeAbortSignals(
  controller: AbortController,
  upstream?: AbortSignal,
): AbortSignal {
  if (!upstream) return controller.signal
  if (upstream.aborted) {
    controller.abort(upstream.reason)
    return controller.signal
  }
  upstream.addEventListener('abort', () => controller.abort(upstream.reason), {
    once: true,
  })
  return controller.signal
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find(value => value !== undefined && value !== '')
}
