import * as path from 'path';

/** Expand the current user's home shorthand without invoking a shell. */
export function expandHomePath(requestedPath: string, homePath: string): string {
  const candidate = requestedPath.trim();
  if (candidate === '~') {
    return path.resolve(homePath);
  }
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return path.resolve(homePath, candidate.slice(2));
  }
  return candidate;
}

export function resolvePermissionPath(
  requestedPath: string,
  workspacePath: string,
  homePath: string,
): string {
  const expandedPath = expandHomePath(requestedPath, homePath);
  return path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(workspacePath, expandedPath);
}

export function isPathOutsideWorkspace(
  requestedPath: string,
  workspacePath: string,
  homePath: string,
): boolean {
  const absolutePath = resolvePermissionPath(requestedPath, workspacePath, homePath);
  const relativePath = path.relative(path.resolve(workspacePath), absolutePath);
  return relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath);
}
