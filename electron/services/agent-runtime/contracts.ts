export interface AgentTurnRequest {
  messages: Array<{ role: string; content: unknown }>;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTurnOutcome {
  content: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  metadata?: Record<string, unknown>;
}

export interface AgentToolCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface AgentToolResult {
  callId: string;
  name: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

interface AgentRuntimeEventBase {
  turnId: string;
  sequence: number;
  timestamp: string;
}

export type AgentRuntimeEvent =
  | (AgentRuntimeEventBase & { type: 'turn-started'; request: AgentTurnRequest })
  | (AgentRuntimeEventBase & { type: 'tool-proposed'; call: AgentToolCall })
  | (AgentRuntimeEventBase & { type: 'tool-started'; call: AgentToolCall; input: Record<string, unknown> })
  | (AgentRuntimeEventBase & { type: 'tool-completed'; result: AgentToolResult })
  | (AgentRuntimeEventBase & { type: 'text-delta'; delta: string })
  | (AgentRuntimeEventBase & { type: 'turn-completed'; outcome: AgentTurnOutcome })
  | (AgentRuntimeEventBase & { type: 'turn-failed'; error: string });

export type AgentRuntimeEventInput = AgentRuntimeEvent extends infer Event
  ? Event extends AgentRuntimeEvent
    ? Omit<Event, keyof AgentRuntimeEventBase>
    : never
  : never;

export type AgentRuntimeEventSink = (event: AgentRuntimeEvent) => void;
