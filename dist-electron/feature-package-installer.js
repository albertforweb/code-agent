"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSignedPackageArtifact = installSignedPackageArtifact;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const TRUSTED_PACKAGE_SIGNING_KEYS = {
    'codeagent-dev-ed25519-2026-07': [
        '-----BEGIN PUBLIC KEY-----',
        'MCowBQYDK2VwAyEAkf9DrK2mkUflgdgfHYA2Q2Tyl+G0CBJ2qyc+wxAEJhY=',
        '-----END PUBLIC KEY-----',
        '',
    ].join('\n'),
};
async function installSignedPackageArtifact(manifest, explicitArchivePath, options = {}) {
    const artifact = manifest.distribution.artifact;
    const resolvedArchive = await resolvePackageArchivePath(manifest, explicitArchivePath, options.download);
    const archivePath = resolvedArchive.archivePath;
    const archiveSha256 = await sha256File(archivePath);
    if (artifact.sha256 && archiveSha256 !== artifact.sha256) {
        throw new Error(`Package archive SHA-256 mismatch for ${manifest.id}. Expected ${artifact.sha256}, got ${archiveSha256}.`);
    }
    const extractDir = await (0, promises_1.mkdtemp)(path_1.default.join((0, os_1.tmpdir)(), `codeagent-${manifest.id}-`));
    try {
        extractTarball(archivePath, extractDir);
        const descriptor = await readArtifactDescriptor(extractDir);
        verifyArtifactDescriptor(manifest, descriptor);
        await verifyArtifactFiles(extractDir, descriptor);
        const version = String(descriptor.version || artifact.version);
        const installDir = path_1.default.join(getCodeAgentConfigHomeDir(), 'feature-packages', manifest.id, version);
        await (0, promises_1.rm)(installDir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(path_1.default.dirname(installDir), { recursive: true });
        await (0, promises_1.cp)(extractDir, installDir, { recursive: true });
        const resultArchivePath = resolvedArchive.cleanupDir
            ? await persistDownloadedArchive(archivePath, manifest, getPackageArchiveFile(manifest), version)
            : archivePath;
        return {
            installedPath: installDir,
            archivePath: resultArchivePath,
            sha256: artifact.sha256 || archiveSha256,
            signature: String(descriptor.signature),
            signingKeyId: String(descriptor.signingKeyId),
            version,
        };
    }
    finally {
        await (0, promises_1.rm)(extractDir, { recursive: true, force: true });
        if (resolvedArchive.cleanupDir) {
            await (0, promises_1.rm)(resolvedArchive.cleanupDir, { recursive: true, force: true });
        }
    }
}
function getCodeAgentConfigHomeDir() {
    return (process.env.CODEAGENT_CONFIG_DIR ??
        process.env.CODE_AGENT_CONFIG_DIR ??
        path_1.default.join((0, os_1.homedir)(), '.code-agent')).normalize('NFC');
}
async function resolvePackageArchivePath(manifest, explicitArchivePath, download) {
    if (explicitArchivePath) {
        const resolved = path_1.default.resolve(explicitArchivePath);
        if (!(0, fs_1.existsSync)(resolved)) {
            throw new Error(`Package archive does not exist: ${resolved}`);
        }
        return { archivePath: resolved };
    }
    const archiveFile = getPackageArchiveFile(manifest);
    if (download?.url) {
        return downloadPackageArchive(manifest, archiveFile, download);
    }
    const candidates = packageDistRootCandidates()
        .map(root => path_1.default.join(root, archiveFile));
    const found = candidates.find(candidate => (0, fs_1.existsSync)(candidate));
    if (!found) {
        throw new Error([
            `Unable to locate signed package archive ${archiveFile}.`,
            'Pass --archive-path, set CODEAGENT_FEATURE_PACKAGE_DIST_ROOT, or install through a platform catalog artifact URL.',
            `Checked: ${candidates.join(', ')}`,
        ].join(' '));
    }
    return { archivePath: found };
}
function getPackageArchiveFile(manifest) {
    const artifact = manifest.distribution.artifact;
    const archiveFile = artifact.archiveFile ?? `${manifest.productSku}-${artifact.version}.tgz`;
    if (!archiveFile || path_1.default.basename(archiveFile) !== archiveFile || archiveFile.includes('/') || archiveFile.includes('\\')) {
        throw new Error(`Package archive filename is invalid: ${archiveFile || 'missing'}`);
    }
    return archiveFile;
}
async function downloadPackageArchive(manifest, archiveFile, download) {
    const url = download.url.trim();
    if (!/^https?:\/\//i.test(url)) {
        throw new Error(`Unsupported package artifact download URL for ${manifest.id}: ${url || 'missing'}`);
    }
    const cleanupDir = await (0, promises_1.mkdtemp)(path_1.default.join((0, os_1.tmpdir)(), `codeagent-${manifest.id}-archive-`));
    const archivePath = path_1.default.join(cleanupDir, archiveFile);
    const response = await fetch(url, {
        headers: normalizeDownloadHeaders(download.headers),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Package artifact download failed for ${manifest.id}: ${response.status} ${detail || response.statusText}`);
    }
    await (0, promises_1.writeFile)(archivePath, Buffer.from(await response.arrayBuffer()));
    return { archivePath, cleanupDir };
}
function normalizeDownloadHeaders(headers) {
    const normalized = {};
    for (const [key, value] of Object.entries(headers ?? {})) {
        if (/^[A-Za-z0-9-]+$/.test(key) && typeof value === 'string') {
            normalized[key] = value;
        }
    }
    return normalized;
}
async function persistDownloadedArchive(archivePath, manifest, archiveFile, version) {
    const archiveInstallPath = path_1.default.join(getCodeAgentConfigHomeDir(), 'feature-package-archives', manifest.id, version, archiveFile);
    await (0, promises_1.mkdir)(path_1.default.dirname(archiveInstallPath), { recursive: true });
    await (0, promises_1.copyFile)(archivePath, archiveInstallPath);
    return archiveInstallPath;
}
function packageDistRootCandidates() {
    const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();
    const candidates = [
        process.env.CODEAGENT_FEATURE_PACKAGE_DIST_ROOT,
        path_1.default.resolve(moduleDir, '../../../code-agent-packages/dist-feature-packages'),
        path_1.default.resolve(moduleDir, '../../code-agent-packages/dist-feature-packages'),
        path_1.default.resolve(process.cwd(), '../code-agent-packages/dist-feature-packages'),
        path_1.default.resolve(process.cwd(), 'dist-feature-packages'),
    ].filter((entry) => Boolean(entry));
    return Array.from(new Set(candidates));
}
function extractTarball(archivePath, destination) {
    const result = (0, child_process_1.spawnSync)('tar', ['-xzf', archivePath, '-C', destination], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(`Unable to extract package archive: ${result.stderr || result.stdout || `exit ${result.status}`}`);
    }
}
async function readArtifactDescriptor(root) {
    const descriptorPath = path_1.default.join(root, 'artifact.json');
    const parsed = parseJsonPayload(await (0, promises_1.readFile)(descriptorPath, 'utf8'));
    if (!isPlainObject(parsed)) {
        throw new Error('Package archive artifact.json is invalid.');
    }
    return parsed;
}
function verifyArtifactDescriptor(manifest, descriptor) {
    if (descriptor.signed !== true) {
        throw new Error('Package artifact descriptor is not signed.');
    }
    if (descriptor.signatureAlgorithm !== 'ed25519') {
        throw new Error(`Unsupported package signature algorithm: ${String(descriptor.signatureAlgorithm || '')}`);
    }
    if (descriptor.packageId !== manifest.id || descriptor.productSku !== manifest.productSku) {
        throw new Error('Package artifact identity does not match the platform catalog.');
    }
    const signingKeyId = typeof descriptor.signingKeyId === 'string' ? descriptor.signingKeyId : '';
    const trustedPublicKey = TRUSTED_PACKAGE_SIGNING_KEYS[signingKeyId];
    if (!trustedPublicKey) {
        throw new Error(`Package signing key is not trusted: ${signingKeyId || 'missing'}`);
    }
    const signingPayload = artifactSigningPayload(descriptor);
    const signingPayloadJson = stableStringify(signingPayload);
    const expectedPayloadSha = sha256Text(signingPayloadJson);
    if (descriptor.signedPayloadSha256 && descriptor.signedPayloadSha256 !== expectedPayloadSha) {
        throw new Error('Package signed payload hash does not match artifact descriptor.');
    }
    const signature = typeof descriptor.signature === 'string' ? descriptor.signature : '';
    const verified = (0, crypto_1.verify)(null, Buffer.from(signingPayloadJson), (0, crypto_1.createPublicKey)(trustedPublicKey), Buffer.from(signature, 'base64'));
    if (!verified) {
        throw new Error('Package signature verification failed.');
    }
}
function artifactSigningPayload(descriptor) {
    return {
        artifactId: descriptor.artifactId,
        packageId: descriptor.packageId,
        productSku: descriptor.productSku,
        version: descriptor.version,
        distributionMode: descriptor.distributionMode,
        manifestFile: descriptor.manifestFile,
        manifestSha256: descriptor.manifestSha256,
        files: descriptor.files,
        fileSha256: descriptor.fileSha256,
    };
}
async function verifyArtifactFiles(root, descriptor) {
    if (!Array.isArray(descriptor.files) || !isPlainObject(descriptor.fileSha256)) {
        throw new Error('Package artifact descriptor is missing file hashes.');
    }
    for (const file of descriptor.files) {
        if (typeof file !== 'string' || !isSafeArtifactPath(file)) {
            throw new Error(`Package artifact contains an unsafe path: ${String(file)}`);
        }
        const expectedSha = descriptor.fileSha256[file];
        if (typeof expectedSha !== 'string') {
            throw new Error(`Package artifact is missing SHA-256 for ${file}.`);
        }
        const actualSha = await sha256File(path_1.default.join(root, file));
        if (actualSha !== expectedSha) {
            throw new Error(`Package file SHA-256 mismatch for ${file}.`);
        }
    }
}
function isSafeArtifactPath(value) {
    return !path_1.default.isAbsolute(value) &&
        !value.split(/[\\/]+/).includes('..') &&
        value !== 'artifact.json';
}
async function sha256File(filePath) {
    return (0, crypto_1.createHash)('sha256').update(await (0, promises_1.readFile)(filePath)).digest('hex');
}
function sha256Text(value) {
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function parseJsonPayload(text) {
    if (!text.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=feature-package-installer.js.map