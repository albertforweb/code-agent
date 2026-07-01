/**
 * Service Bridge - Local History
 *
 * Durable local history for high-volume records such as chat sessions, tool
 * events, automation runs, and project events. The current backing store is
 * per-record JSON files so it has no native dependency, while the service API
 * stays narrow enough to replace with SQLite later.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export type LocalHistoryRecordType =
  | 'chat-session'
  | 'tool-event'
  | 'automation-run'
  | 'project-event';

export interface LocalHistoryRecord {
  schemaVersion: 1;
  id: string;
  type: LocalHistoryRecordType;
  workspacePath?: string;
  title?: string;
  data: any;
  createdAt: number;
  updatedAt: number;
}

export interface LocalHistoryRecordInput {
  id?: string;
  type: LocalHistoryRecordType;
  workspacePath?: string;
  title?: string;
  data: any;
  createdAt?: number;
  updatedAt?: number;
}

export interface LocalHistoryFilter {
  type?: LocalHistoryRecordType;
  workspacePath?: string;
  limit?: number;
}

export interface LocalHistoryExport {
  schemaVersion: 1;
  exportedAt: number;
  records: LocalHistoryRecord[];
}

export interface LocalHistoryStorageInfo {
  storagePath: string;
  recordCount: number;
  updatedAt?: number;
}

export class LocalHistoryServiceBridge {
  constructor(
    private readonly storageDir: string = path.join(os.homedir(), '.code-agent', 'history'),
  ) {}

  async saveRecord(input: LocalHistoryRecordInput): Promise<LocalHistoryRecord> {
    const now = Date.now();
    const id = this.normalizeId(input.id ?? this.createId(input.type));
    const existing = await this.getRecord(id).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    });

    const record: LocalHistoryRecord = {
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

  async getRecord(id: string): Promise<LocalHistoryRecord> {
    return this.readJsonFile<LocalHistoryRecord>(this.getRecordPath(this.normalizeId(id)));
  }

  async listRecords(filter: LocalHistoryFilter = {}): Promise<LocalHistoryRecord[]> {
    await fs.mkdir(this.storageDir, { recursive: true });
    const entries = await fs.readdir(this.storageDir, { withFileTypes: true });
    const records: LocalHistoryRecord[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      try {
        const record = await this.readJsonFile<LocalHistoryRecord>(path.join(this.storageDir, entry.name));
        if (this.matchesFilter(record, filter)) {
          records.push(record);
        }
      } catch (error) {
        console.warn(`Failed to read local history record ${entry.name}:`, error);
      }
    }

    const limit = this.normalizeLimit(filter.limit);
    return records
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, limit);
  }

  async deleteRecord(id: string): Promise<{ ok: true; id: string }> {
    const normalizedId = this.normalizeId(id);
    try {
      await fs.unlink(this.getRecordPath(normalizedId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    return { ok: true, id: normalizedId };
  }

  async exportRecords(filter: LocalHistoryFilter = {}): Promise<LocalHistoryExport> {
    return {
      schemaVersion: 1,
      exportedAt: Date.now(),
      records: await this.listRecords(filter),
    };
  }

  async getStorageInfo(): Promise<LocalHistoryStorageInfo> {
    const records = await this.listRecords({ limit: Number.MAX_SAFE_INTEGER });
    return {
      storagePath: this.storageDir,
      recordCount: records.length,
      updatedAt: records[0]?.updatedAt,
    };
  }

  private matchesFilter(record: LocalHistoryRecord, filter: LocalHistoryFilter): boolean {
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

  private getRecordPath(id: string): string {
    return path.join(this.storageDir, `${this.safeFilename(id)}.json`);
  }

  private async readJsonFile<T>(filePath: string): Promise<T> {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  }

  private normalizeId(id: string): string {
    const trimmed = String(id ?? '').trim();
    return trimmed || this.createId('history');
  }

  private normalizeWorkspacePath(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    const expanded = value.trim().startsWith('~')
      ? path.join(os.homedir(), value.trim().slice(1))
      : value.trim();
    return path.resolve(expanded);
  }

  private normalizeTimestamp(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private mergeRecordData(previous: unknown, next: unknown): unknown {
    if (
      previous &&
      next &&
      typeof previous === 'object' &&
      typeof next === 'object' &&
      !Array.isArray(previous) &&
      !Array.isArray(next)
    ) {
      return {
        ...(previous as Record<string, unknown>),
        ...(next as Record<string, unknown>),
      };
    }

    return next;
  }

  private normalizeLimit(value: unknown): number {
    const parsed = Number(value ?? 200);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 200;
    }
    return Math.min(Math.floor(parsed), 10_000);
  }

  private safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || this.createId('record');
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }
}
