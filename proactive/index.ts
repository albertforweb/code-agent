// Proactive module - provides proactive agent functionality
export interface ProactiveConfig {
  enabled: boolean;
  triggers?: Record<string, any>;
}

export function initializeProactive(config?: ProactiveConfig): void {
  // Stub implementation
}

export function isProactiveEnabled(): boolean {
  return false;
}

export default {
  initializeProactive,
  isProactiveEnabled,
};
