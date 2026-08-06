import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DesktopPermissionProfile } from '../types';

export async function ensureProjectChatWorkspace(
  workspacePath: string,
  permissionProfile: DesktopPermissionProfile,
  requestCreationReview: () => Promise<void>,
): Promise<'existing' | 'created'> {
  const resolvedWorkspacePath = path.resolve(workspacePath);
  try {
    const stats = await fs.stat(resolvedWorkspacePath);
    if (!stats.isDirectory()) {
      throw new Error(`Project workspace path is not a directory: ${resolvedWorkspacePath}`);
    }
    return 'existing';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (permissionProfile === 'workspace-only' || permissionProfile === 'ask') {
    await requestCreationReview();
  }
  await fs.mkdir(resolvedWorkspacePath, { recursive: true });
  return 'created';
}
