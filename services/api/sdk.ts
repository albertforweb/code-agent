export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type ClientOptions = {
  apiKey?: string | null
  authToken?: string
  baseURL?: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeout?: number
  dangerouslyAllowBrowser?: boolean
  fetch?: FetchLike
  fetchOptions?: RequestInit
  logger?: {
    error?: (message: string, ...args: unknown[]) => void
    warn?: (message: string, ...args: unknown[]) => void
    info?: (message: string, ...args: unknown[]) => void
    debug?: (message: string, ...args: unknown[]) => void
  }
}

export type MessageCreateResult = Promise<unknown> & {
  withResponse?: () => Promise<{
    data: unknown
    response: Response
    request_id: string | null
  }>
  asResponse?: () => Promise<Response>
}

export type MessagesResource = {
  create: (
    params: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => MessageCreateResult
  countTokens?: (
    params: Record<string, unknown>,
  ) => Promise<{ input_tokens: number; [key: string]: unknown }>
}

export type LlmClient = {
  beta: {
    messages: MessagesResource
  }
  messages: MessagesResource
  models?: {
    list?: () => AsyncIterable<unknown> | Promise<unknown>
  }
}

export type { LlmClient as default }

export class APIError extends Error {
  readonly status?: number
  readonly error?: unknown
  readonly headers?: Headers
  readonly requestID?: string

  constructor(
    status?: number,
    error?: unknown,
    message?: string,
    headers?: Headers,
    requestID?: string,
  ) {
    super(message ?? extractMessage(error) ?? String(status ?? 'API error'))
    this.name = 'APIError'
    this.status = status
    this.error = error
    this.headers = headers
    this.requestID = requestID ?? headers?.get?.('request-id') ?? undefined
  }

  static generate(
    status?: number,
    error?: unknown,
    message?: string,
    headers?: Headers,
  ): APIError {
    if (status === 401) return new AuthenticationError(status, error, message, headers)
    if (status === 404) return new NotFoundError(status, error, message, headers)
    return new APIError(status, error, message, headers)
  }
}

export class APIConnectionError extends APIError {
  constructor(options?: { message?: string; cause?: unknown }) {
    super(undefined, undefined, options?.message ?? 'Connection error')
    this.name = 'APIConnectionError'
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export class APIConnectionTimeoutError extends APIConnectionError {
  constructor(options?: { message?: string; cause?: unknown }) {
    super({ message: options?.message ?? 'Request timed out', cause: options?.cause })
    this.name = 'APIConnectionTimeoutError'
  }
}

export class APIUserAbortError extends Error {
  constructor(message = 'Request aborted') {
    super(message)
    this.name = 'APIUserAbortError'
  }
}

export class AuthenticationError extends APIError {
  constructor(
    status = 401,
    error?: unknown,
    message?: string,
    headers?: Headers,
  ) {
    super(status, error, message ?? extractMessage(error) ?? 'Authentication failed', headers)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends APIError {
  constructor(
    status = 404,
    error?: unknown,
    message?: string,
    headers?: Headers,
  ) {
    super(status, error, message ?? extractMessage(error) ?? 'Not found', headers)
    this.name = 'NotFoundError'
  }
}

function extractMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const record = error as Record<string, unknown>
  if (typeof record.message === 'string') return record.message
  const nested = record.error
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>
    if (typeof nestedRecord.message === 'string') return nestedRecord.message
  }
  return undefined
}

export class Stream<Item> implements AsyncIterable<Item> {
  readonly controller: AbortController
  readonly #iteratorFactory: () => AsyncIterable<Item> | AsyncIterator<Item>

  constructor(
    iteratorFactory: () => AsyncIterable<Item> | AsyncIterator<Item>,
    controller = new AbortController(),
  ) {
    this.#iteratorFactory = iteratorFactory
    this.controller = controller
  }

  [Symbol.asyncIterator](): AsyncIterator<Item> {
    const iterator = this.#iteratorFactory()
    if (Symbol.asyncIterator in iterator) {
      return iterator[Symbol.asyncIterator]()
    }
    return iterator
  }
}
