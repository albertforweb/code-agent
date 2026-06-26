/**
 * Service Bridge - File System Service
 * Bridges file system operations to IPC channels
 * Handles reading, writing, and listing files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileEntry, FileWritePreview } from '../types';

const { createTwoFilesPatch } = require('diff') as {
  createTwoFilesPatch: (
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: Record<string, unknown>,
  ) => string;
};

const MAX_DIFF_INPUT_BYTES = 200_000;
const MAX_WRITE_CHECKPOINTS = 20;

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
    this.writeCheckpoints.unshift(checkpoint);
    this.writeCheckpoints = this.writeCheckpoints.slice(0, MAX_WRITE_CHECKPOINTS);

    return {
      ok: true,
      path: checkpoint.path,
      absolutePath: fullPath,
      checkpointId: checkpoint.id,
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
      if ((error as any).code === 'ENOENT') {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
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
