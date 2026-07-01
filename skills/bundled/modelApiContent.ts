// Fallback content for local Node builds where Bun text-loader assets are absent.
export const SKILL_MODEL_VARS = {
  OPUS_ID: 'codeAgent-opus-4-6',
  OPUS_NAME: 'CodeAgent Opus 4.6',
  SONNET_ID: 'codeAgent-sonnet-4-6',
  SONNET_NAME: 'CodeAgent Sonnet 4.6',
  HAIKU_ID: 'codeAgent-haiku-4-5',
  HAIKU_NAME: 'CodeAgent Haiku 4.5',
  PREV_SONNET_ID: 'codeAgent-sonnet-4-5',
} satisfies Record<string, string>

export const SKILL_PROMPT = ''

export const SKILL_FILES: Record<string, string> = {}
