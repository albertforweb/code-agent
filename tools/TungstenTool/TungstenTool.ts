import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const inputSchema = z.object({}).passthrough()
const outputSchema = z.object({
  message: z.string(),
})

type Input = z.infer<typeof inputSchema>
type Output = z.infer<typeof outputSchema>

export function clearSessionsWithTungstenUsage(): void {}

export function resetInitializationState(): void {}

export const TungstenTool = buildTool({
  name: 'TungstenTool',
  searchHint: 'internal terminal workflow helper',
  maxResultSizeChars: 10_000,
  isEnabled() {
    return process.env.USER_TYPE === 'internal'
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  async description(): Promise<string> {
    return 'Internal-only Tungsten tool'
  },
  async prompt(): Promise<string> {
    return 'Internal-only Tungsten tool. This build provides a no-op placeholder.'
  },
  get inputSchema() {
    return inputSchema
  },
  get outputSchema() {
    return outputSchema
  },
  async call(_input: Input): Promise<{ data: Output }> {
    return {
      data: {
        message: 'TungstenTool is unavailable in this build',
      },
    }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: jsonStringify(content),
    }
  },
  renderToolUseMessage() {
    return 'TungstenTool'
  },
  renderToolResultMessage(output: Output) {
    return output.message
  },
  renderToolUseRejectedMessage() {
    return 'TungstenTool rejected'
  },
  renderToolUseErrorMessage() {
    return 'TungstenTool error'
  },
  renderToolUseProgressMessage() {
    return null
  },
})
