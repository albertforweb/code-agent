/**
 * Service Bridge - Command execution
 * Runs approved, non-interactive workspace commands for desktop agent tools.
 */

import { spawn } from 'child_process';
import * as path from 'path';

const { parse: parseShellCommand } = require('shell-quote') as {
  parse: (command: string) => Array<string | { op: string }>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 100_000;

export interface CommandRunPreview {
  command: string;
  argv: string[];
  cwd: string;
  absoluteCwd: string;
  timeoutMs: number;
}

export interface CommandRunResult extends CommandRunPreview {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export class CommandServiceBridge {
  constructor(private readonly workspacePath: string = process.cwd()) {}

  createRunPreview(args: Record<string, any>): CommandRunPreview {
    const command = String(args.command ?? '').trim();
    if (!command) {
      throw new Error('bash.run requires a command string.');
    }

    const argv = this.parseCommand(command);
    this.validateCommand(argv);

    const absoluteCwd = this.resolveCwd(args.cwd);
    return {
      command,
      argv,
      cwd: this.relativeCwd(absoluteCwd),
      absoluteCwd,
      timeoutMs: this.resolveTimeout(args.timeoutMs ?? args.timeout),
    };
  }

  runCommand(args: Record<string, any>): Promise<CommandRunResult> {
    const preview = this.createRunPreview(args);
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(preview.argv[0], preview.argv.slice(1), {
        cwd: preview.absoluteCwd,
        shell: false,
        windowsHide: true,
        env: process.env,
      });

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let timedOut = false;

      const appendOutput = (current: string, chunk: Buffer, currentBytes: number) => {
        if (currentBytes >= MAX_OUTPUT_BYTES) {
          truncated = true;
          return { text: current, bytes: currentBytes };
        }

        const remaining = MAX_OUTPUT_BYTES - currentBytes;
        const nextChunk = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        if (nextChunk.length < chunk.length) {
          truncated = true;
        }

        return {
          text: `${current}${nextChunk.toString('utf-8')}`,
          bytes: currentBytes + nextChunk.length,
        };
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, preview.timeoutMs);

      child.stdout.on('data', chunk => {
        const next = appendOutput(stdout, Buffer.from(chunk), stdoutBytes);
        stdout = next.text;
        stdoutBytes = next.bytes;
      });

      child.stderr.on('data', chunk => {
        const next = appendOutput(stderr, Buffer.from(chunk), stderrBytes);
        stderr = next.text;
        stderrBytes = next.bytes;
      });

      child.on('error', error => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start command: ${error.message}`));
      });

      child.on('close', (exitCode, signal) => {
        clearTimeout(timeout);
        resolve({
          ...preview,
          ok: exitCode === 0 && !timedOut,
          exitCode,
          signal,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut,
          truncated,
        });
      });
    });
  }

  private parseCommand(command: string): string[] {
    const parts = parseShellCommand(command);
    if (!parts.length) {
      throw new Error('Command is empty.');
    }

    const hasShellOperator = parts.some(part => typeof part !== 'string');
    if (hasShellOperator) {
      throw new Error('Shell operators such as pipes, redirects, &&, and ; are not supported. Run one simple command at a time.');
    }

    return parts.map(part => String(part));
  }

  private validateCommand(argv: string[]): void {
    const executable = path.basename(argv[0]).toLowerCase();
    const commandText = argv.join(' ').toLowerCase();
    const blockedExecutables = new Set([
      'rm',
      'rmdir',
      'sudo',
      'su',
      'dd',
      'mkfs',
      'diskutil',
      'shutdown',
      'reboot',
      'halt',
      'poweroff',
      'killall',
    ]);

    if (blockedExecutables.has(executable)) {
      throw new Error(`Blocked potentially destructive command: ${argv[0]}`);
    }

    if (executable === 'git' && (commandText.includes(' reset --hard') || commandText.includes(' clean '))) {
      throw new Error('Blocked destructive git command. Use non-destructive inspection commands first.');
    }
  }

  private resolveCwd(value: unknown): string {
    const requested = typeof value === 'string' && value.trim() ? value.trim() : '.';
    if (requested === '~' || requested.startsWith('~/')) {
      throw new Error('Home-directory cwd paths are not supported. Use a workspace-relative path.');
    }

    const absoluteCwd = path.resolve(this.workspacePath, requested);
    const relative = path.relative(this.workspacePath, absoluteCwd);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Command cwd must stay inside the current workspace.');
    }

    return absoluteCwd;
  }

  private relativeCwd(absoluteCwd: string): string {
    const relative = path.relative(this.workspacePath, absoluteCwd).split(path.sep).join('/');
    return relative || '.';
  }

  private resolveTimeout(value: unknown): number {
    const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }

    return Math.min(Math.floor(parsed), MAX_TIMEOUT_MS);
  }
}
