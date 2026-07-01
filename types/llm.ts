export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type CacheControl = {
  type: 'ephemeral'
  ttl?: '1h'
  scope?: string
}

export type Base64ImageSource = {
  type: 'base64'
  media_type: string
  data: string
}

export type TextBlockParam = {
  type: 'text'
  text: string
  cache_control?: CacheControl
  [key: string]: unknown
}

export type ImageBlockParam = {
  type: 'image'
  source: Base64ImageSource | Record<string, unknown>
  cache_control?: CacheControl
  [key: string]: unknown
}

export type ToolUseBlockParam = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
  cache_control?: CacheControl
  [key: string]: unknown
}

export type ToolUseBlock = ToolUseBlockParam

export type ToolResultBlockParam = {
  type: 'tool_result'
  tool_use_id: string
  content?: string | ContentBlockParam[]
  is_error?: boolean
  cache_control?: CacheControl
  [key: string]: unknown
}

export type ThinkingBlockParam = {
  type: 'thinking'
  thinking: string
  signature?: string
  [key: string]: unknown
}

export type ThinkingBlock = ThinkingBlockParam

export type RedactedThinkingBlockParam = {
  type: 'redacted_thinking'
  data: string
  [key: string]: unknown
}

export type RedactedThinkingBlock = RedactedThinkingBlockParam

export type ContentBlockParam =
  | TextBlockParam
  | ImageBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam
  | ThinkingBlockParam
  | RedactedThinkingBlockParam
  | ({ type: string } & Record<string, unknown>)

export type ContentBlock = ContentBlockParam

export type MessageParam = {
  role: 'user' | 'assistant'
  content: string | ContentBlockParam[]
  [key: string]: unknown
}

export type BetaUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  server_tool_use?: Record<string, unknown>
  service_tier?: string
  [key: string]: unknown
}

export type BetaMessage = {
  id?: string
  type?: 'message'
  role?: 'assistant'
  model?: string
  content: BetaContentBlock[]
  stop_reason?: BetaStopReason | null
  stop_sequence?: string | null
  usage?: BetaUsage
  [key: string]: unknown
}

export type BetaContentBlock = ContentBlock
export type BetaContentBlockParam = ContentBlockParam
export type BetaImageBlockParam = ImageBlockParam
export type BetaToolUseBlock = ToolUseBlock
export type BetaToolResultBlockParam = ToolResultBlockParam
export type BetaThinkingBlock = ThinkingBlock
export type BetaRedactedThinkingBlock = RedactedThinkingBlock
export type BetaRequestDocumentBlock = { type: 'document'; [key: string]: unknown }
export type BetaMessageParam = MessageParam

export type BetaStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'pause_turn'
  | 'refusal'
  | string

export type BetaMessageDeltaUsage = Partial<BetaUsage>

export type BetaOutputConfig = {
  type?: string
  [key: string]: unknown
}

export type BetaJSONOutputFormat = {
  type: 'json_schema'
  schema?: unknown
  [key: string]: unknown
}

export type BetaTool = {
  name: string
  description?: string
  input_schema?: unknown
  [key: string]: unknown
}

export type BetaWebSearchTool20250305 = BetaTool & {
  type?: 'web_search_20250305'
}

export type BetaToolUnion = BetaTool | BetaWebSearchTool20250305

export type BetaToolChoiceAuto = { type: 'auto'; [key: string]: unknown }
export type BetaToolChoiceAny = { type: 'any'; [key: string]: unknown }
export type BetaToolChoiceDisabled = {
  type: 'disabled'
  [key: string]: unknown
}
export type BetaToolChoiceTool = {
  type: 'tool'
  name?: string
  id?: string
  [key: string]: unknown
}

export type ToolChoice =
  | BetaToolChoiceAuto
  | BetaToolChoiceAny
  | BetaToolChoiceDisabled
  | BetaToolChoiceTool

export type BetaThinkingConfigParam = {
  type: 'enabled' | 'disabled'
  budget_tokens?: number
  [key: string]: unknown
}

export type BetaRawMessageStreamEvent = {
  type: string
  index?: number
  message?: BetaMessage
  content_block?: BetaContentBlock
  delta?: Record<string, unknown>
  usage?: BetaUsage
  [key: string]: unknown
}

export type BetaMessageStreamParams = {
  model?: string
  messages?: BetaMessageParam[]
  system?: string | ContentBlockParam[]
  max_tokens?: number
  stream?: boolean
  tools?: BetaToolUnion[]
  tool_choice?: ToolChoice
  thinking?: BetaThinkingConfigParam
  speed?: string
  [key: string]: unknown
}
