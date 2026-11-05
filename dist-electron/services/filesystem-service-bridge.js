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
const diff_1 = require("diff");
const MAX_DIFF_INPUT_BYTES = 200000;
const MAX_WRITE_CHECKPOINTS = 20;
const MAX_SEARCH_FILES = 5000;
const MAX_SEARCH_DIRECTORIES = 5000;
const MAX_SEARCH_FILE_BYTES = 1000000;
const MAX_SEARCH_TOTAL_BYTES = 25000000;
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
        this.rememberWriteCheckpoint(checkpoint);
        return {
            ok: true,
            path: checkpoint.path,
            absolutePath: fullPath,
            checkpointId: checkpoint.id,
        };
    }
    async createFileWithCheckpoint(filePath, content, encoding = 'utf-8', review) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        this._validateWriteSize(content);
        const previous = await this._readExistingContent(fullPath, encoding);
        if (previous.exists) {
            throw new Error(`File already exists: ${filePath}. Use fs.edit to make a focused change without replacing the whole file.`);
        }
        const relativePath = this._relativePath(fullPath);
        const preview = {
            path: relativePath,
            absolutePath: fullPath,
            exists: false,
            previousSizeBytes: 0,
            nextSizeBytes: Buffer.byteLength(content, encoding),
            diff: this._createDiff(relativePath, '', content, false),
        };
        await review?.(preview);
        const checkpoint = {
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
        }
        catch (error) {
            if (error.code === 'EEXIST') {
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
    async editFileWithCheckpoint(filePath, oldText, newText, encoding = 'utf-8', review) {
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
        const preview = {
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
        const checkpoint = {
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
            const target = await fs.stat(fullPath);
            if (target.isFile()) {
                throw new Error(`Path is a file, not a directory: ${dirPath}. Use fs.read to inspect its contents.`);
            }
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
            if (error instanceof Error && error.message.includes('Path is a file, not a directory:')) {
                throw error;
            }
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
                throw new Error(`Directory not found: ${dirPath}`);
            }
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async searchFiles(query, dirPath = '.', requestedLimit = 50) {
        const normalizedQuery = query.trim();
        if (!normalizedQuery) {
            throw new Error('fs.search requires a non-empty text query.');
        }
        if (normalizedQuery.length > 500) {
            throw new Error('fs.search query cannot exceed 500 characters.');
        }
        const rootPath = this._resolvePath(dirPath);
        this._validatePath(rootPath);
        let rootStats;
        try {
            rootStats = await fs.stat(rootPath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Directory not found: ${dirPath}`);
            }
            throw new Error(`Failed to search directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!rootStats.isDirectory()) {
            throw new Error(`fs.search requires a directory path, not a file: ${dirPath}`);
        }
        const limit = Math.min(MAX_SEARCH_MATCHES, Math.max(1, Math.floor(requestedLimit) || 50));
        const pendingDirectories = [rootPath];
        const matches = [];
        let filesSearched = 0;
        let filesVisited = 0;
        let directoriesVisited = 0;
        let filesSkipped = 0;
        let totalBytesSearched = 0;
        let truncated = false;
        const lowerQuery = normalizedQuery.toLowerCase();
        while (pendingDirectories.length > 0 && !truncated) {
            const currentDirectory = pendingDirectories.pop();
            if (directoriesVisited >= MAX_SEARCH_DIRECTORIES) {
                truncated = true;
                break;
            }
            directoriesVisited += 1;
            let entries;
            try {
                entries = await fs.readdir(currentDirectory, { withFileTypes: true });
            }
            catch (error) {
                if (error.code === 'ENOENT') {
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
                let content;
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
                }
                catch (error) {
                    if (error.code === 'ENOENT') {
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
    rememberWriteCheckpoint(checkpoint) {
        this.writeCheckpoints.unshift(checkpoint);
        this.writeCheckpoints = this.writeCheckpoints.slice(0, MAX_WRITE_CHECKPOINTS);
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
            if (error.code === 'EISDIR') {
                throw new Error('The requested write path is a directory. fs.write requires a file path such as "main.py" or "src/app.py".');
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
        return (0, diff_1.createTwoFilesPatch)(oldLabel, `${relativePath} (proposed)`, previousContent, nextContent, '', '', { context: 3 }).trim();
    }
}
exports.FileSystemServiceBridge = FileSystemServiceBridge;
//# sourceMappingURL=filesystem-service-bridge.js.map