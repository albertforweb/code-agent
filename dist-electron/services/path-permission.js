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
exports.expandHomePath = expandHomePath;
exports.resolvePermissionPath = resolvePermissionPath;
exports.isPathOutsideWorkspace = isPathOutsideWorkspace;
const path = __importStar(require("path"));
/** Expand the current user's home shorthand without invoking a shell. */
function expandHomePath(requestedPath, homePath) {
    const candidate = requestedPath.trim();
    if (candidate === '~') {
        return path.resolve(homePath);
    }
    if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
        return path.resolve(homePath, candidate.slice(2));
    }
    return candidate;
}
function resolvePermissionPath(requestedPath, workspacePath, homePath) {
    const expandedPath = expandHomePath(requestedPath, homePath);
    return path.isAbsolute(expandedPath)
        ? path.resolve(expandedPath)
        : path.resolve(workspacePath, expandedPath);
}
function isPathOutsideWorkspace(requestedPath, workspacePath, homePath) {
    const absolutePath = resolvePermissionPath(requestedPath, workspacePath, homePath);
    const relativePath = path.relative(path.resolve(workspacePath), absolutePath);
    return relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath);
}
//# sourceMappingURL=path-permission.js.map