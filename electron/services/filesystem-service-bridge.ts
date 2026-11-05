/**
 * Service Bridge - File System Service
 * Bridges file system operations to IPC channels
 * Handles reading, writing, and listing files
 */

import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';
import type { FileEntry, FileWritePreview } from '../types';

const MAX_DIFF_INPUT_BYTES = 200_000;
const MAX_WRITE_CHECKPOINTS = 20;
const MAX_SEARCH_FILES = 5_000;
const MAX_SEARCH_DIRECTORIES = 5_000;
const MAX_SEARCH_FILE_BYTES = 1_000_000;
const MAX_SEARCH_TOTAL_BYTES = 25_000_000;
const MAX_SEARCH_MATCHES = 100;
const MAX_SEARCH_LINE_LENGTH = 500;
const IGNORED_SEARCH_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.venv',
  '.cache',
  'build',
  'coverage',
  'dist',
  'dist-build',
  'dist-electron',
  'dist-renderer',
  'node_modules',
  'target',
  'venv',
]);

interface WriteCheckpoint {
  id: string;
  path: string;
  absolutePath: string;
  existed: boolean;
  previousContent: string;
  encoding: BufferEncoding;
  createdAt: number;
}

/**
 * File System Service Bridge - bridges file operations to IPC
 */
export class FileSystemServiceBridge {
  private basePath: string = process.cwd();
  private maxFileSize: number = 1024 * 1024 * 10; // 10 MB
  private writeCheckpoints: WriteCheckpoint[] = [];
  private allowedExtensions: string[] = [
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md',
    '.txt', '.yml', '.yaml', '.xml', '.html', '.css',
    '.py', '.java', '.go', '.rs', '.rb', '.sh',
  ];

  constructor(basePath?: string) {
    if (basePath) {
      this.basePath = basePath;
    }
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    try {
      const content = await fs.readFile(fullPath, encoding);
      return content;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    // Check file size
    this._validateWriteSize(content);

    try {
      await this._writeResolvedFile(fullPath, content, encoding);
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build a safe write preview for user review before an agent write is applied.
   */
  async createWritePreview(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<FileWritePreview> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);
    this._validateWriteSize(content);

    const previous = await this._readExistingContent(fullPath, encoding);
    const relativePath = this._relativePath(fullPath);

    return {
      path: relativePath,
      absolutePath: fullPath,
      exists: previous.exists,
      previousSizeBytes: Buffer.byteLength(previous.content, encoding),
      nextSizeBytes: Buffer.byteLength(content, encoding),
      diff: this._createDiff(relativePath, previous.content, content, previous.exists),
    };
  }

  /**
   * Write a file and keep an in-memory checkpoint for undo.
   */
  async writeFileWithCheckpoint(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<{
    ok: true;
    path: string;
    absolutePath: string;
    checkpointId: string;
  }> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);
    this._validateWriteSize(content);

    const previous = await this._readExistingContent(fullPath, encoding);
    const checkpoint: WriteCheckpoint = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: this._relativePath(fullPath),
      absolutePath: fullPath,
      existed: previous.exists,
      previousContent: previous.content,
      encoding,
      createdAt: Date.now(),
    };

    await this._writeResolvedFile(fullPath, content, encoding);
    this.rememberWriteCheckpoint(checkpoint);

    return {
      ok: true,
      path: checkpoint.path,
      absolutePath: fullPath,
      checkpointId: checkpoint.id,
    };
  }

  async createFileWithCheckpoint(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf-8',
    review?: (preview: FileWritePreview) => Promise<void>,
  ): Promise<{ ok: true; path: string; absolutePath: string; checkpointId: string }> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);
    this._validateWriteSize(content);
    const previous = await this._readExistingContent(fullPath, encoding);
    if (previous.exists) {
      throw new Error(`File already exists: ${filePath}. Use fs.edit to make a focused change without replacing the whole file.`);
    }

    const relativePath = this._relativePath(fullPath);
    const preview: FileWritePreview = {
      path: relativePath,
      absolutePath: fullPath,
      exists: false,
      previousSizeBytes: 0,
      nextSizeBytes: Buffer.byteLength(content, encoding),
      diff: this._createDiff(relativePath, '', content, false),
    };
    await review?.(preview);

    const checkpoint: WriteCheckpoint = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: relativePath,
      absolutePath: fullPath,
      existed: false,
      previousContent: '',
      encoding,
      createdAt: Date.now(),
    };
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    try {
      await fs.writeFile(fullPath, content, { encoding, flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`File already exists: ${filePath}. Use fs.edit to make a focused change without replacing the whole file.`);
      }
      throw error;
    }
    this.rememberWriteCheckpoint(checkpoint);

    return {
      ok: true,
      path: checkpoint.path,
      absolutePath: fullPath,
      checkpointId: checkpoint.id,
    };
  }

  async editFileWithCheckpoint(
    filePath: string,
    oldText: string,
    newText: string,
    encoding: BufferEncoding = 'utf-8',
    review?: (preview: FileWritePreview) => Promise<void>,
  ): Promise<{ ok: true; path: string; absolutePath: string; checkpointId: string; replacements: 1 }> {
    if (!oldText) {
      throw new Error('fs.edit requires non-empty oldText so the replacement is anchored to existing file content.');
    }

    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);
    const previous = await this._readExistingContent(fullPath, encoding);
    if (!previous.exists) {
      throw new Error(`File not found: ${filePath}. Use fs.write to create a new file.`);
    }

    const firstMatch = previous.content.indexOf(oldText);
    if (firstMatch < 0) {
      throw new Error(`The requested oldText was not found in ${filePath}. Read the current file and retry with an exact match.`);
    }
    if (previous.content.indexOf(oldText, firstMatch + oldText.length) >= 0) {
      throw new Error(`The requested oldText matches more than once in ${filePath}. Include more surrounding context so fs.edit changes exactly one location.`);
    }

    const nextContent = previous.content.slice(0, firstMatch) + newText + previous.content.slice(firstMatch + oldText.length);
    this._validateWriteSize(nextContent);
    const relativePath = this._relativePath(fullPath);
    const preview: FileWritePreview = {
      path: relativePath,
      absolutePath: fullPath,
      exists: true,
      previousSizeBytes: Buffer.byteLength(previous.content, encoding),
      nextSizeBytes: Buffer.byteLength(nextContent, encoding),
      diff: this._createDiff(relativePath, previous.content, nextContent, true),
    };
    await review?.(preview);

    const latestContent = await fs.readFile(fullPath, encoding);
    if (latestContent !== previous.content) {
      throw new Error(`File changed while the edit was awaiting review: ${filePath}. Read the latest file and retry.`);
    }

    const checkpoint: WriteCheckpoint = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: relativePath,
      absolutePath: fullPath,
      existed: true,
      previousContent: previous.content,
      encoding,
      createdAt: Date.now(),
    };
    await this._writeResolvedFile(fullPath, nextContent, encoding);
    this.rememberWriteCheckpoint(checkpoint);

    return {
      ok: true,
      path: checkpoint.path,
      absolutePath: fullPath,
      checkpointId: checkpoint.id,
      replacements: 1,
    };
  }

  /**
   * Restore the most recent write checkpoint.
   */
  async restoreLastWriteCheckpoint(): Promise<{
    ok: true;
    checkpointId: string;
    path: string;
    absolutePath: string;
    restored: 'previous-content' | 'deleted-created-file';
  }> {
    const checkpoint = this.writeCheckpoints.shift();
    if (!checkpoint) {
      throw new Error('No file write checkpoint is available to restore.');
    }

    this._validatePath(checkpoint.absolutePath);

    if (checkpoint.existed) {
      await this._writeResolvedFile(checkpoint.absolutePath, checkpoint.previousContent, checkpoint.encoding);
      return {
        ok: true,
        checkpointId: checkpoint.id,
        path: checkpoint.path,
        absolutePath: checkpoint.absolutePath,
        restored: 'previous-content',
      };
    }

    try {
      await fs.unlink(checkpoint.absolutePath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw new Error(`Failed to restore checkpoint: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      ok: true,
      checkpointId: checkpoint.id,
      path: checkpoint.path,
      absolutePath: checkpoint.absolutePath,
      restored: 'deleted-created-file',
    };
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<FileEntry[]> {
    const fullPath = this._resolvePath(dirPath);
    this._validatePath(fullPath);

    try {
      const target = await fs.stat(fullPath);
      if (target.isFile()) {
        throw new Error(`Path is a file, not a directory: ${dirPath}. Use fs.read to inspect its contents.`);
      }
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const results: FileEntry[] = [];

      for (const entry of entries) {
        try {
          const stats = await fs.stat(path.join(fullPath, entry.name));

          results.push({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.getTime(),
          });
        } catch (error) {
          // Skip files we can't stat
          console.warn(`Failed to stat ${entry.name}:`, error);
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path is a file, not a directory:')) {
        throw error;
      }
      if ((error as any).code === 'ENOENT' || (error as any).code === 'ENOTDIR') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchFiles(
    query: string,
    dirPath = '.',
    requestedLimit = 50,
  ): Promise<{
    query: string;
    path: string;
    absolutePath: string;
    filesSearched: number;
    filesSkipped: number;
    truncated: boolean;
    matches: Array<{ path: string; line: number; text: string }>;
  }> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new Error('fs.search requires a non-empty text query.');
    }
    if (normalizedQuery.length > 500) {
      throw new Error('fs.search query cannot exceed 500 characters.');
    }

    const rootPath = this._resolvePath(dirPath);
    this._validatePath(rootPath);
    let rootStats: Awaited<ReturnType<typeof fs.stat>>;
    try {
      rootStats = await fs.stat(rootPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw new Error(`Failed to search directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!rootStats.isDirectory()) {
      throw new Error(`fs.search requires a directory path, not a file: ${dirPath}`);
    }
    const limit = Math.min(MAX_SEARCH_MATCHES, Math.max(1, Math.floor(requestedLimit) || 50));
    const pendingDirectories = [rootPath];
    const matches: Array<{ path: string; line: number; text: string }> = [];
    let filesSearched = 0;
    let filesVisited = 0;
    let directoriesVisited = 0;
    let filesSkipped = 0;
    let totalBytesSearched = 0;
    let truncated = false;
    const lowerQuery = normalizedQuery.toLowerCase();

    while (pendingDirectories.length > 0 && !truncated) {
      const currentDirectory = pendingDirectories.pop()!;
      if (directoriesVisited >= MAX_SEARCH_DIRECTORIES) {
        truncated = true;
        break;
      }
      directoriesVisited += 1;
      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentDirectory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          filesSkipped += 1;
          continue;
        }
        throw new Error(`Failed to search directory ${this._relativePath(currentDirectory)}: ${error instanceof Error ? error.message : String(error)}`);
      }

      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_SEARCH_DIRECTORIES.has(entry.name.toLowerCase())) {
            pendingDirectories.push(path.join(currentDirectory, entry.name));
          }
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        if (filesVisited >= MAX_SEARCH_FILES) {
          truncated = true;
          break;
        }
        filesVisited += 1;

        const filePath = path.join(currentDirectory, entry.name);
        let content: Buffer;
        let fileSize = 0;
        try {
          const stats = await fs.stat(filePath);
          if (stats.size > MAX_SEARCH_FILE_BYTES) {
            filesSkipped += 1;
            continue;
          }
          if (totalBytesSearched + stats.size > MAX_SEARCH_TOTAL_BYTES) {
            truncated = true;
            break;
          }
          fileSize = stats.size;
          content = await fs.readFile(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            filesSkipped += 1;
            continue;
          }
          throw new Error(`Failed to search file ${this._relativePath(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
        }

        filesSearched += 1;
        totalBytesSearched += fileSize;
        if (content.includes(0)) {
          filesSkipped += 1;
          continue;
        }

        const lines = content.toString('utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (!lines[index].toLowerCase().includes(lowerQuery)) {
            continue;
          }
          const lineText = lines[index].trim();
          matches.push({
            path: this._relativePath(filePath),
            line: index + 1,
            text: lineText.length > MAX_SEARCH_LINE_LENGTH
              ? `${lineText.slice(0, MAX_SEARCH_LINE_LENGTH)}...`
              : lineText,
          });
          if (matches.length >= limit) {
            truncated = true;
            break;
          }
        }
        if (truncated) {
          break;
        }
      }
    }

    return {
      query: normalizedQuery,
      path: dirPath,
      absolutePath: rootPath,
      filesSearched,
      filesSkipped,
      truncated,
      matches,
    };
  }


  /**
   * Resolve a workspace path for trusted main-process actions.
   */
  resolveWorkspacePath(filePath: string): string {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);
    return fullPath;
  }

  /**
   * Check if file/directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file or directory
   */
  async delete(filePath: string, recursive: boolean = false): Promise<void> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        if (recursive) {
          await fs.rm(fullPath, { recursive: true });
        } else {
          throw new Error('Cannot delete directory without recursive flag');
        }
      } else {
        await fs.unlink(fullPath);
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get file statistics
   */
  async stat(filePath: string): Promise<{ size: number; modified: number; isDirectory: boolean }> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    try {
      const stats = await fs.stat(fullPath);

      return {
        size: stats.size,
        modified: stats.mtime.getTime(),
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to stat file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve file path safely
   */
  private _resolvePath(filePath: string): string {
    const normalizedInput = filePath.trim();
    if (normalizedInput === '~' || normalizedInput.startsWith('~/')) {
      throw new Error('Home-directory paths are not supported by the desktop file bridge. Use a workspace-relative path.');
    }

    // Resolve relative to base path
    let resolved = path.resolve(this.basePath, normalizedInput);

    // Prevent directory traversal
    const relative = path.relative(this.basePath, resolved);
    if (relative.startsWith('..')) {
      throw new Error('Path traversal not allowed');
    }

    return resolved;
  }

  /**
   * Validate file path
   */
  private _validatePath(fullPath: string): void {
    // Check extension (optional - can be disabled for certain operations)
    const ext = path.extname(fullPath);
    if (ext && !this.allowedExtensions.includes(ext.toLowerCase())) {
      // Allow but warn - don't block
      console.warn(`File extension not in whitelist: ${ext}`);
    }
  }

  /**
   * Set base path for file operations
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  /**
   * Get base path
   */
  getBasePath(): string {
    return this.basePath;
  }

  private _validateWriteSize(content: string): void {
    if (Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
      throw new Error(`File too large: maximum ${this.maxFileSize} bytes`);
    }
  }

  private rememberWriteCheckpoint(checkpoint: WriteCheckpoint): void {
    this.writeCheckpoints.unshift(checkpoint);
    this.writeCheckpoints = this.writeCheckpoints.slice(0, MAX_WRITE_CHECKPOINTS);
  }

  private async _writeResolvedFile(fullPath: string, content: string, encoding: BufferEncoding): Promise<void> {
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, encoding);
  }

  private async _readExistingContent(
    fullPath: string,
    encoding: BufferEncoding,
  ): Promise<{ exists: boolean; content: string }> {
    try {
      return {
        exists: true,
        content: await fs.readFile(fullPath, encoding),
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return { exists: false, content: '' };
      }
      if ((error as any).code === 'EISDIR') {
        throw new Error('The requested write path is a directory. fs.write requires a file path such as "main.py" or "src/app.py".');
      }
      throw new Error(`Failed to read existing file for review: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private _relativePath(fullPath: string): string {
    return path.relative(this.basePath, fullPath).split(path.sep).join('/') || path.basename(fullPath);
  }

  private _createDiff(relativePath: string, previousContent: string, nextContent: string, exists: boolean): string {
    const previousBytes = Buffer.byteLength(previousContent, 'utf-8');
    const nextBytes = Buffer.byteLength(nextContent, 'utf-8');

    if (previousBytes + nextBytes > MAX_DIFF_INPUT_BYTES) {
      return [
        `Large file change omitted from inline diff.`,
        `Previous size: ${previousBytes} bytes`,
        `New size: ${nextBytes} bytes`,
      ].join('\n');
    }

    const oldLabel = exists ? `${relativePath} (current)` : `${relativePath} (new file)`;
    return createTwoFilesPatch(
      oldLabel,
      `${relativePath} (proposed)`,
      previousContent,
      nextContent,
      '',
      '',
      { context: 3 },
    ).trim();
  }
}
