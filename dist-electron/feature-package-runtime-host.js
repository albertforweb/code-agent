"use strict";
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
exports.activateInstalledFeaturePackageRuntimes = activateInstalledFeaturePackageRuntimes;
exports.activateInstalledFeaturePackageRuntime = activateInstalledFeaturePackageRuntime;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path = __importStar(require("path"));
const url_1 = require("url");
const dynamicImport = new Function('specifier', 'return import(specifier)');
function getFeaturePackageRoot() {
    const configRoot = process.env.CODEAGENT_CONFIG_DIR
        ?? process.env.CODE_AGENT_CONFIG_DIR
        ?? path.join((0, os_1.homedir)(), '.code-agent');
    return path.join(configRoot.normalize('NFC'), 'feature-packages');
}
function defaultLogger(packageId) {
    return {
        debug(message, metadata) { console.debug(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
        info(message, metadata) { console.info(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
        warn(message, metadata) { console.warn(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
        error(message, metadata) { console.error(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
    };
}
function compareVersionsDescending(left, right) {
    return right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' });
}
async function resolveLatestInstalledVersion(packageDir) {
    const entries = await (0, promises_1.readdir)(packageDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort(compareVersionsDescending)[0];
}
function validatePackageId(packageId) {
    const normalized = packageId.trim();
    if (!normalized || !/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
        throw new Error(`Feature package ID is invalid: ${packageId || 'missing'}`);
    }
    return normalized;
}
async function resolveRuntimePath(packageRoot, relativeEntrypoint) {
    const canonicalRoot = await (0, promises_1.realpath)(packageRoot);
    const canonicalRuntime = await (0, promises_1.realpath)(path.resolve(packageRoot, relativeEntrypoint));
    if (canonicalRuntime !== canonicalRoot && !canonicalRuntime.startsWith(`${canonicalRoot}${path.sep}`)) {
        throw new Error(`Runtime entrypoint escapes its installed package: ${relativeEntrypoint}`);
    }
    return canonicalRuntime;
}
function readRuntimeModule(imported) {
    const candidate = (imported.default ?? imported);
    if (!candidate || typeof candidate.activate !== 'function' || typeof candidate.packageId !== 'string') {
        throw new Error('Runtime entrypoint does not export a valid feature-package runtime module.');
    }
    return candidate;
}
/**
 * Activates installed package runtimes without importing any professional workflow
 * into the core app. Packages register their own policy providers through the SDK.
 */
async function activateInstalledFeaturePackageRuntimes(options) {
    const root = getFeaturePackageRoot();
    let packageEntries;
    try {
        packageEntries = await (0, promises_1.readdir)(root, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        throw error;
    }
    for (const packageEntry of packageEntries.filter(entry => entry.isDirectory())) {
        try {
            await activateInstalledFeaturePackageRuntime(packageEntry.name, options);
        }
        catch (error) {
            console.warn(`Unable to activate installed feature package ${packageEntry.name}.`, error);
        }
    }
}
/**
 * Activates one installed runtime. This is also used after Store installation so
 * a package becomes usable in the current process instead of requiring a restart.
 */
async function activateInstalledFeaturePackageRuntime(packageId, options) {
    const normalizedPackageId = validatePackageId(packageId);
    const packageDir = path.join(getFeaturePackageRoot(), normalizedPackageId);
    const version = await resolveLatestInstalledVersion(packageDir);
    if (!version)
        return false;
    const packageRoot = path.join(packageDir, version);
    const manifest = JSON.parse(await (0, promises_1.readFile)(path.join(packageRoot, 'manifest.json'), 'utf8'));
    if (manifest.id !== normalizedPackageId) {
        throw new Error(`Installed manifest id ${manifest.id} does not match package directory ${normalizedPackageId}.`);
    }
    const runtimeEntrypoint = manifest.entrypoints?.runtime;
    if (!runtimeEntrypoint || !manifest.supportedShells.includes('desktop'))
        return false;
    const runtimePath = await resolveRuntimePath(packageRoot, runtimeEntrypoint);
    // Reinstalling the same semantic version replaces files at the same path. A
    // cache-busting query ensures Electron loads the newly verified runtime.
    const runtimeUrl = new URL((0, url_1.pathToFileURL)(runtimePath).href);
    runtimeUrl.searchParams.set('activation', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const runtime = readRuntimeModule(await dynamicImport(runtimeUrl.href));
    if (runtime.packageId !== manifest.id) {
        throw new Error(`Runtime package id ${runtime.packageId} does not match manifest id ${manifest.id}.`);
    }
    await runtime.activate({
        shell: 'desktop',
        packageRoot,
        manifest,
        logger: options.logger ?? defaultLogger(manifest.id),
        registerExtension() {
            // Navigation and renderer extensions are loaded from signed manifest metadata.
        },
        registerAutomationProvider: provider => options.registerAutomationProvider(provider, manifest.id),
    });
    return true;
}
//# sourceMappingURL=feature-package-runtime-host.js.map