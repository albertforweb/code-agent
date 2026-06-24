/**
 * Service Bridge - File System Service
 * Bridges file system operations to IPC channels
 * Handles reading, writing, and listing files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileEntry } from '../types';

/**
 * File System Service Bridge - bridges file operations to IPC
 */
export class FileSystemServiceBridge {
  private basePath: string = process.cwd();
  private maxFileSize: number = 1024 * 1024 * 10; // 10 MB
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
  async readFile(filePath: string, encoding: string = 'utf-8'): Promise<string> {
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
  async writeFile(filePath: string, content: string, encoding: string = 'utf-8'): Promise<void> {
    const fullPath = this._resolvePath(filePath);
    this._validatePath(fullPath);

    // Check file size
    if (content.length > this.maxFileSize) {
      throw new Error(`File too large: maximum ${this.maxFileSize} bytes`);
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(fullPath, content, encoding);
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    // Resolve relative to base path
    let resolved = path.resolve(this.basePath, filePath);

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
}
