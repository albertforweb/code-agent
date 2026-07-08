import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';
import semverPkg from 'semver';

export function feature(_name: string): boolean {
  return false;
}

export function hash(input: string | NodeJS.ArrayBufferView): string {
  const hasher = crypto.createHash('sha256');
  hasher.update(input);
  return hasher.digest('hex');
}

export function gc(fullCollect?: boolean): void {
  if (typeof globalThis.gc === 'function') {
    globalThis.gc(fullCollect);
  }
}

export function which(command: string): string | null {
  try {
    const result = execSync(`which ${command}`, { encoding: 'utf-8' }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function spawn(
  command: string,
  args?: readonly string[],
  options?: Parameters<typeof childSpawn>[2],
) {
  return childSpawn(command, args ?? [], options ?? {});
}

export const file = {
  read: (targetPath: string) => fs.readFileSync(targetPath),
  write: (targetPath: string, data: string | NodeJS.ArrayBufferView) =>
    fs.writeFileSync(targetPath, data),
  exists: (targetPath: string) => fs.existsSync(targetPath),
};

export function stringWidth(value: string): number {
  return value.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function wrapAnsi(value: string, width: number): string {
  return value
    .split('\n')
    .map(line => {
      if (line.length <= width) return line;
      const chunks: string[] = [];
      let currentLine = '';
      for (const char of line) {
        if (currentLine.length >= width) {
          chunks.push(currentLine);
          currentLine = '';
        }
        currentLine += char;
      }
      if (currentLine) chunks.push(currentLine);
      return chunks.join('\n');
    })
    .join('\n');
}

export const semver = {
  parse: (version: string) => semverPkg.parse(version, { loose: true }),
  gte: (version: string, target: string) =>
    semverPkg.gte(version, target, { loose: true }),
  satisfies: (version: string, range: string) =>
    semverPkg.satisfies(version, range, { loose: true }),
  order: (a: string, b: string) => semverPkg.compare(a, b, { loose: true }),
};

const runtime = {
  feature,
  hash,
  gc,
  which,
  spawn,
  file,
  stringWidth,
  wrapAnsi,
  semver,
};

(globalThis as typeof globalThis & { Bun?: typeof runtime }).Bun = runtime;

export default runtime;
