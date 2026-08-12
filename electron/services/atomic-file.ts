import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface AtomicWriteOptions {
  mode?: number;
  beforeRename?: (temporaryPath: string) => Promise<void> | void;
}

export async function atomicWriteFile(
  filePath: string,
  content: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });

  const existingMode = await fs.stat(filePath)
    .then(stat => stat.mode & 0o777)
    .catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    });
  const mode = options.mode ?? existingMode ?? 0o600;
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let handle: fs.FileHandle | undefined;

  try {
    handle = await fs.open(temporaryPath, 'wx', mode);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeRename?.(temporaryPath);
    await fs.rename(temporaryPath, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporaryPath).catch(unlinkError => {
      if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError;
    });
    throw error;
  }
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
