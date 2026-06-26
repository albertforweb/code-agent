"use strict";
/**
 * Service Bridge - File System Service
 * Bridges file system operations to IPC channels
 * Handles reading, writing, and listing files
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemServiceBridge = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const { createTwoFilesPatch } = require('diff');
const MAX_DIFF_INPUT_BYTES = 200000;
const MAX_WRITE_CHECKPOINTS = 20;
/**
 * File System Service Bridge - bridges file operations to IPC
 */
class FileSystemServiceBridge {
    constructor(basePath) {
        this.basePath = process.cwd();
        this.maxFileSize = 1024 * 1024 * 10; // 10 MB
        this.writeCheckpoints = [];
        this.allowedExtensions = [
            '.ts', '.tsx', '.js', '.jsx', '.json', '.md',
            '.txt', '.yml', '.yaml', '.xml', '.html', '.css',
            '.py', '.java', '.go', '.rs', '.rb', '.sh',
        ];
        if (basePath) {
            this.basePath = basePath;
        }
    }
    /**
     * Read file contents
     */
    async readFile(filePath, encoding = 'utf-8') {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        try {
            const content = await fs.readFile(fullPath, encoding);
            return content;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Write file contents
     */
    async writeFile(filePath, content, encoding = 'utf-8') {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        // Check file size
        this._validateWriteSize(content);
        try {
            await this._writeResolvedFile(fullPath, content, encoding);
        }
        catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Build a safe write preview for user review before an agent write is applied.
     */
    async createWritePreview(filePath, content, encoding = 'utf-8') {
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
    async writeFileWithCheckpoint(filePath, content, encoding = 'utf-8') {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        this._validateWriteSize(content);
        const previous = await this._readExistingContent(fullPath, encoding);
        const checkpoint = {
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
    async restoreLastWriteCheckpoint() {
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
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
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
    async listDirectory(dirPath) {
        const fullPath = this._resolvePath(dirPath);
        this._validatePath(fullPath);
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });
            const results = [];
            for (const entry of entries) {
                try {
                    const stats = await fs.stat(path.join(fullPath, entry.name));
                    results.push({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        modified: stats.mtime.getTime(),
                    });
                }
                catch (error) {
                    // Skip files we can't stat
                    console.warn(`Failed to stat ${entry.name}:`, error);
                }
            }
            return results;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Directory not found: ${dirPath}`);
            }
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Resolve a workspace path for trusted main-process actions.
     */
    resolveWorkspacePath(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        return fullPath;
    }
    /**
     * Check if file/directory exists
     */
    async exists(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        try {
            await fs.access(fullPath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Delete file or directory
     */
    async delete(filePath, recursive = false) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        try {
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) {
                if (recursive) {
                    await fs.rm(fullPath, { recursive: true });
                }
                else {
                    throw new Error('Cannot delete directory without recursive flag');
                }
            }
            else {
                await fs.unlink(fullPath);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get file statistics
     */
    async stat(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        try {
            const stats = await fs.stat(fullPath);
            return {
                size: stats.size,
                modified: stats.mtime.getTime(),
                isDirectory: stats.isDirectory(),
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            throw new Error(`Failed to stat file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Resolve file path safely
     */
    _resolvePath(filePath) {
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
    _validatePath(fullPath) {
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
    setBasePath(basePath) {
        this.basePath = basePath;
    }
    /**
     * Get base path
     */
    getBasePath() {
        return this.basePath;
    }
    _validateWriteSize(content) {
        if (Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
            throw new Error(`File too large: maximum ${this.maxFileSize} bytes`);
        }
    }
    async _writeResolvedFile(fullPath, content, encoding) {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, encoding);
    }
    async _readExistingContent(fullPath, encoding) {
        try {
            return {
                exists: true,
                content: await fs.readFile(fullPath, encoding),
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return { exists: false, content: '' };
            }
            throw new Error(`Failed to read existing file for review: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    _relativePath(fullPath) {
        return path.relative(this.basePath, fullPath).split(path.sep).join('/') || path.basename(fullPath);
    }
    _createDiff(relativePath, previousContent, nextContent, exists) {
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
        return createTwoFilesPatch(oldLabel, `${relativePath} (proposed)`, previousContent, nextContent, '', '', { context: 3 }).trim();
    }
}
exports.FileSystemServiceBridge = FileSystemServiceBridge;
//# sourceMappingURL=filesystem-service-bridge.js.map