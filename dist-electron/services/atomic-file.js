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
exports.atomicWriteFile = atomicWriteFile;
exports.atomicWriteJson = atomicWriteJson;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
async function atomicWriteFile(filePath, content, options = {}) {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });
    const existingMode = await fs.stat(filePath)
        .then(stat => stat.mode & 0o777)
        .catch(error => {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    });
    const mode = options.mode ?? existingMode ?? 0o600;
    const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    let handle;
    try {
        handle = await fs.open(temporaryPath, 'wx', mode);
        await handle.writeFile(content);
        await handle.sync();
        await handle.close();
        handle = undefined;
        await options.beforeRename?.(temporaryPath);
        await fs.rename(temporaryPath, filePath);
        await syncDirectory(directory);
    }
    catch (error) {
        await handle?.close().catch(() => undefined);
        await fs.unlink(temporaryPath).catch(unlinkError => {
            if (unlinkError.code !== 'ENOENT')
                throw unlinkError;
        });
        throw error;
    }
}
async function atomicWriteJson(filePath, data) {
    await atomicWriteFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
async function syncDirectory(directory) {
    let handle;
    try {
        handle = await fs.open(directory, 'r');
        await handle.sync();
    }
    catch (error) {
        if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(error.code ?? '')) {
            throw error;
        }
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
//# sourceMappingURL=atomic-file.js.map