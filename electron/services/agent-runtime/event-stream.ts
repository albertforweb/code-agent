import { randomUUID } from 'node:crypto';
import type { AgentRuntimeEvent, AgentRuntimeEventInput, AgentRuntimeEventSink } from './contracts.js';

export interface AgentRuntimeEventEmitter {
  readonly turnId: string;
  emit(event: AgentRuntimeEventInput): AgentRuntimeEvent;
}

export function createAgentRuntimeEventEmitter(
  sink?: AgentRuntimeEventSink,
  turnId = randomUUID(),
  now: () => Date = () => new Date(),
): AgentRuntimeEventEmitter {
  let sequence = 0;

  return {
    turnId,
    emit(event) {
      const enriched = {
        ...event,
        turnId,
        sequence: sequence++,
        timestamp: now().toISOString(),
      } as AgentRuntimeEvent;
      sink?.(enriched);
      return enriched;
    },
  };
}
