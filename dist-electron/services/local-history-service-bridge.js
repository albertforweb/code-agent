"use strict";
/**
 * Service Bridge - Local History
 *
 * Durable local history for high-volume records such as chat sessions, tool
 * events, automation runs, and project events. The current backing store is
 * per-record JSON files so it has no native dependency, while the service API
 * stays narrow enough to replace with SQLite later.
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
exports.LocalHistoryServiceBridge = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
class LocalHistoryServiceBridge {
    constructor(storageDir = path.join(os.homedir(), '.code-agent', 'history')) {
        this.storageDir = storageDir;
    }
    async saveRecord(input) {
        const now = Date.now();
        const id = this.normalizeId(input.id ?? this.createId(input.type));
        const existing = await this.getRecord(id).catch(error => {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        });
        const record = {
            schemaVersion: 1,
            id,
            type: input.type,
            workspacePath: this.normalizeWorkspacePath(input.workspacePath ?? existing?.workspacePath),
            title: typeof input.title === 'string' && input.title.trim()
                ? input.title.trim()
                : existing?.title,
            data: this.mergeRecordData(existing?.data, input.data),
            createdAt: this.normalizeTimestamp(input.createdAt ?? existing?.createdAt, now),
            updatedAt: this.normalizeTimestamp(input.updatedAt, now),
        };
        await this.writeJsonFile(this.getRecordPath(id), record);
        return record;
    }
    async getRecord(id) {
        return this.readJsonFile(this.getRecordPath(this.normalizeId(id)));
    }
    async listRecords(filter = {}) {
        await fs.mkdir(this.storageDir, { recursive: true });
        const entries = await fs.readdir(this.storageDir, { withFileTypes: true });
        const records = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) {
                continue;
            }
            try {
                const record = await this.readJsonFile(path.join(this.storageDir, entry.name));
                if (this.matchesFilter(record, filter)) {
                    records.push(record);
                }
            }
            catch (error) {
                console.warn(`Failed to read local history record ${entry.name}:`, error);
            }
        }
        const limit = this.normalizeLimit(filter.limit);
        return records
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .slice(0, limit);
    }
    async deleteRecord(id) {
        const normalizedId = this.normalizeId(id);
        try {
            await fs.unlink(this.getRecordPath(normalizedId));
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        return { ok: true, id: normalizedId };
    }
    async exportRecords(filter = {}) {
        return {
            schemaVersion: 1,
            exportedAt: Date.now(),
            records: await this.listRecords(filter),
        };
    }
    async getStorageInfo() {
        const records = await this.listRecords({ limit: Number.MAX_SAFE_INTEGER });
        return {
            storagePath: this.storageDir,
            recordCount: records.length,
            updatedAt: records[0]?.updatedAt,
        };
    }
    matchesFilter(record, filter) {
        if (filter.type && record.type !== filter.type) {
            return false;
        }
        if (filter.workspacePath) {
            const expected = this.normalizeWorkspacePath(filter.workspacePath);
            if (record.workspacePath !== expected) {
                return false;
            }
        }
        return true;
    }
    getRecordPath(id) {
        return path.join(this.storageDir, `${this.safeFilename(id)}.json`);
    }
    async readJsonFile(filePath) {
        return JSON.parse(await fs.readFile(filePath, 'utf-8'));
    }
    async writeJsonFile(filePath, data) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    }
    normalizeId(id) {
        const trimmed = String(id ?? '').trim();
        return trimmed || this.createId('history');
    }
    normalizeWorkspacePath(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return undefined;
        }
        const expanded = value.trim().startsWith('~')
            ? path.join(os.homedir(), value.trim().slice(1))
            : value.trim();
        return path.resolve(expanded);
    }
    normalizeTimestamp(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    mergeRecordData(previous, next) {
        if (previous &&
            next &&
            typeof previous === 'object' &&
            typeof next === 'object' &&
            !Array.isArray(previous) &&
            !Array.isArray(next)) {
            return {
                ...previous,
                ...next,
            };
        }
        return next;
    }
    normalizeLimit(value) {
        const parsed = Number(value ?? 200);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 200;
        }
        return Math.min(Math.floor(parsed), 10000);
    }
    safeFilename(value) {
        return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || this.createId('record');
    }
    createId(prefix) {
        return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }
}
exports.LocalHistoryServiceBridge = LocalHistoryServiceBridge;
//# sourceMappingURL=local-history-service-bridge.js.map