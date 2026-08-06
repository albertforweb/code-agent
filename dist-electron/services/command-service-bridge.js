"use strict";
/**
 * Service Bridge - Command execution
 * Runs approved, non-interactive workspace commands for desktop agent tools.
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
exports.CommandServiceBridge = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const { parse: parseShellCommand } = require('shell-quote');
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;
const MAX_OUTPUT_BYTES = 100000;
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
class CommandServiceBridge {
    constructor(workspacePath = process.cwd()) {
        this.workspacePath = workspacePath;
    }
    createRunPreview(args) {
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
    runCommand(args) {
        const preview = this.createRunPreview(args);
        const startedAt = Date.now();
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(preview.argv[0], preview.argv.slice(1), {
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
            const appendOutput = (current, chunk, currentBytes) => {
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
    parseCommand(command) {
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
    validateCommand(argv) {
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
    resolveExecutionArgv(argv, absoluteCwd) {
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
        throw new Error(`Executable not found: ${requestedExecutable}. ` +
            (requestedName === 'python' || requestedName === 'pip'
                ? 'Use python3 (and python3 -m pip) or install Python 3.'
                : 'Install it or add its directory to PATH.'));
    }
    findExecutable(executable, absoluteCwd) {
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
    isExecutableFile(candidate) {
        try {
            const stat = fs.statSync(candidate);
            if (!stat.isFile()) {
                return false;
            }
            fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    executableDirectories(absoluteCwd) {
        const configured = String(process.env.PATH || '')
            .split(path.delimiter)
            .map(directory => directory.trim())
            .filter(Boolean);
        const workspaceEnvironments = [
            absoluteCwd && path.join(absoluteCwd, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
            absoluteCwd && path.join(absoluteCwd, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
            path.join(this.workspacePath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
            path.join(this.workspacePath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin'),
        ].filter((directory) => Boolean(directory));
        return [...new Set([...workspaceEnvironments, ...configured, ...STANDARD_EXECUTABLE_DIRECTORIES])];
    }
    executionEnvironment(absoluteCwd) {
        return {
            ...process.env,
            PATH: this.executableDirectories(absoluteCwd).join(path.delimiter),
        };
    }
    resolveCwd(value) {
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
    relativeCwd(absoluteCwd) {
        const relative = path.relative(this.workspacePath, absoluteCwd).split(path.sep).join('/');
        return relative || '.';
    }
    resolveTimeout(value) {
        const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return DEFAULT_TIMEOUT_MS;
        }
        return Math.min(Math.floor(parsed), MAX_TIMEOUT_MS);
    }
}
exports.CommandServiceBridge = CommandServiceBridge;
//# sourceMappingURL=command-service-bridge.js.map