export type PermissionMode = 'ask' | 'skip_all_permission_checks' | 'follow_a_plan';

export type Logger = {
  debug?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type CodeAgentForChromeContext = Record<string, unknown>;

export const BROWSER_TOOLS: Array<{ name: string }> = [];

export function createCodeAgentForChromeMcpServer(
  _context?: CodeAgentForChromeContext,
) {
  return {
    setRequestHandler() {},
    async connect() {},
  };
}
