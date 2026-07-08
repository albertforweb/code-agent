export type CoordinateMode = 'absolute' | 'relative';

export type CuSubGates = Record<string, unknown>;

export type ScreenshotDims = {
  width?: number;
  height?: number;
  displayId?: number;
  originX?: number;
  originY?: number;
};

export type CuPermissionRequest = Record<string, unknown>;

export type CuPermissionResponse = {
  granted?: string[];
  denied?: string[];
  flags?: Record<string, unknown>;
};

export type CuCallToolResult = {
  content?: unknown[];
  isError?: boolean;
};

export type ComputerUseSessionContext = Record<string, unknown>;

export type ComputerExecutor = Record<string, unknown>;
export type DisplayGeometry = Record<string, unknown>;
export type FrontmostApp = Record<string, unknown>;
export type InstalledApp = Record<string, unknown>;
export type ResolvePrepareCaptureResult = Record<string, unknown>;
export type RunningApp = Record<string, unknown>;
export type ScreenshotResult = Record<string, unknown>;

export const DEFAULT_GRANT_FLAGS: Record<string, unknown> = {};
export const API_RESIZE_PARAMS: Record<string, unknown> = {};

export function targetImageSize(width: number, height: number): [number, number] {
  return [width, height];
}

export function buildComputerUseTools(): Array<{ name: string }> {
  return [];
}

export function bindSessionContext(_context: ComputerUseSessionContext) {
  return async (): Promise<CuCallToolResult> => ({
    isError: true,
    content: [{ type: 'text', text: 'Computer control is not bundled in this CLI package.' }],
  });
}

export function createComputerUseMcpServer() {
  return {
    setRequestHandler() {},
    async connect() {},
  };
}
