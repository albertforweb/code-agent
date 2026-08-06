/**
 * Service Bridge - Command execution
 * Runs approved, non-interactive workspace commands for desktop agent tools.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const { parse: parseShellCommand } = require('shell-quote') as {
  parse: (command: string) => Array<string | { op: string }>;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 100_000;

const STANDARD_EXECUTABLE_DIRECTORIES = process.platform === 'win32'
  ? []
  : [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ];

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

    const parsedArgv = this.parseCommand(command);
    this.validateCommand(parsedArgv);
    const absoluteCwd = this.resolveCwd(args.cwd);
    const argv = this.resolveExecutionArgv(parsedArgv, absoluteCwd);
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
        env: this.executionEnvironment(preview.absoluteCwd),
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

  /**
   * Packaged macOS apps inherit a minimal launch-services PATH rather than the
   * user's interactive shell PATH. Resolve the common Python aliases before
   * presenting a review so the approved argv is also the argv we execute.
   */
  private resolveExecutionArgv(argv: string[], absoluteCwd: string): string[] {
    const [requestedExecutable, ...args] = argv;
    const requestedName = path.basename(requestedExecutable).toLowerCase();
    const resolvedRequested = this.findExecutable(requestedExecutable, absoluteCwd);
    if (resolvedRequested) {
      return [resolvedRequested, ...args];
    }

    if (requestedName === 'python') {
      const python3 = this.findExecutable('python3', absoluteCwd);
      if (python3) {
        return [python3, ...args];
      }
    }

    if (requestedName === 'pip') {
      const python3 = this.findExecutable('python3', absoluteCwd);
      if (python3) {
        return [python3, '-m', 'pip', ...args];
      }

      const pip3 = this.findExecutable('pip3', absoluteCwd);
      if (pip3) {
        return [pip3, ...args];
      }
    }

    if (['uvicorn', 'pytest'].includes(requestedName)) {
      const python = this.findExecutable('python', absoluteCwd) || this.findExecutable('python3', absoluteCwd);
      if (python) {
        return [python, '-m', requestedName, ...args];
      }
    }

    throw new Error(
      `Executable not found: ${requestedExecutable}. ` +
      (requestedName === 'python' || requestedName === 'pip'
        ? 'Use python3 (and python3 -m pip) or install Python 3.'
        : 'Install it or add its directory to PATH.'),
    );
  }

  private findExecutable(executable: string, absoluteCwd: string): string | null {
    if (executable.includes('/') || executable.includes('\\')) {
      const absolute = path.isAbsolute(executable)
        ? executable
        : path.resolve(absoluteCwd, executable);
      return this.isExecutableFile(absolute) ? absolute : null;
    }

    const extensions = process.platform === 'win32'
      ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
    const names = path.extname(executable) || process.platform !== 'win32'
      ? [executable]
      : extensions.map(extension => `${executable}${extension.toLowerCase()}`);

    for (const directory of this.executableDirectories(absoluteCwd)) {
      for (const name of names) {
        const candidate = path.join(directory, name);
        if (this.isExecutableFile(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private isExecutableFile(candidate: string): boolean {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) {
        return false;
      }
      fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private executableDirectories(absoluteCwd?: string): string[] {
    const configured = String(process.env.PATH || '')
      .split(path.delimiter)
      .map(directory => directory.trim())
      .filter(Boolean);
    const workspaceEnvironments = [
      absoluteCwd && path.join(absoluteCwd, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
      absoluteCwd && path.join(absoluteCwd, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
      path.join(this.workspacePath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
      path.join(this.workspacePath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
    ].filter((directory): directory is string => Boolean(directory));
    return [...new Set([...workspaceEnvironments, ...configured, ...STANDARD_EXECUTABLE_DIRECTORIES])];
  }

  private executionEnvironment(absoluteCwd: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PATH: this.executableDirectories(absoluteCwd).join(path.delimiter),
    };
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
