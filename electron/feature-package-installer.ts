import type { FeaturePackageManifest } from '@codeagent/feature-package-sdk';
import { createHash, createPublicKey, verify } from 'crypto';
import { existsSync } from 'fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const TRUSTED_PACKAGE_SIGNING_KEYS: Record<string, string> = {
  'codeagent-dev-ed25519-2026-07': [
    '-----BEGIN PUBLIC KEY-----',
    'MCowBQYDK2VwAyEAkf9DrK2mkUflgdgfHYA2Q2Tyl+G0CBJ2qyc+wxAEJhY=',
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n'),
};

export interface FeaturePackageLocalInstallResult {
  installedPath: string;
  archivePath: string;
  sha256: string;
  signature: string;
  signingKeyId: string;
  version: string;
}

export interface FeaturePackageArtifactDownloadRequest {
  url: string;
  headers?: Record<string, string>;
}

export interface FeaturePackageInstallOptions {
  download?: FeaturePackageArtifactDownloadRequest;
}

export async function installSignedPackageArtifact(
  manifest: FeaturePackageManifest,
  explicitArchivePath?: string,
  options: FeaturePackageInstallOptions = {},
): Promise<FeaturePackageLocalInstallResult> {
  const artifact = manifest.distribution.artifact as FeaturePackageManifest['distribution']['artifact'] & {
    archiveFile?: string;
    signatureAlgorithm?: string;
    signedPayloadSha256?: string;
  };
  const resolvedArchive = await resolvePackageArchivePath(manifest, explicitArchivePath, options.download);
  const archivePath = resolvedArchive.archivePath;
  const archiveSha256 = await sha256File(archivePath);
  if (artifact.sha256 && archiveSha256 !== artifact.sha256) {
    throw new Error(`Package archive SHA-256 mismatch for ${manifest.id}. Expected ${artifact.sha256}, got ${archiveSha256}.`);
  }

  const extractDir = await mkdtemp(path.join(tmpdir(), `codeagent-${manifest.id}-`));
  try {
    extractTarball(archivePath, extractDir);
    const descriptor = await readArtifactDescriptor(extractDir);
    verifyArtifactDescriptor(manifest, descriptor);
    await verifyArtifactFiles(extractDir, descriptor);

    const version = String(descriptor.version || artifact.version);
    const installDir = path.join(
      getCodeAgentConfigHomeDir(),
      'feature-packages',
      manifest.id,
      version,
    );
    await rm(installDir, { recursive: true, force: true });
    await mkdir(path.dirname(installDir), { recursive: true });
    await cp(extractDir, installDir, { recursive: true });
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
  } finally {
    await rm(extractDir, { recursive: true, force: true });
    if (resolvedArchive.cleanupDir) {
      await rm(resolvedArchive.cleanupDir, { recursive: true, force: true });
    }
  }
}

function getCodeAgentConfigHomeDir(): string {
  return (
    process.env.CODEAGENT_CONFIG_DIR ??
    process.env.CODE_AGENT_CONFIG_DIR ??
    path.join(homedir(), '.code-agent')
  ).normalize('NFC');
}

async function resolvePackageArchivePath(
  manifest: FeaturePackageManifest,
  explicitArchivePath?: string,
  download?: FeaturePackageArtifactDownloadRequest,
): Promise<{ archivePath: string; cleanupDir?: string }> {
  if (explicitArchivePath) {
    const resolved = path.resolve(explicitArchivePath);
    if (!existsSync(resolved)) {
      throw new Error(`Package archive does not exist: ${resolved}`);
    }
    return { archivePath: resolved };
  }

  const archiveFile = getPackageArchiveFile(manifest);
  if (download?.url) {
    return downloadPackageArchive(manifest, archiveFile, download);
  }

  const candidates = packageDistRootCandidates()
    .map(root => path.join(root, archiveFile));
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error([
      `Unable to locate signed package archive ${archiveFile}.`,
      'Pass --archive-path, set CODEAGENT_FEATURE_PACKAGE_DIST_ROOT, or install through a platform catalog artifact URL.',
      `Checked: ${candidates.join(', ')}`,
    ].join(' '));
  }
  return { archivePath: found };
}

function getPackageArchiveFile(manifest: FeaturePackageManifest): string {
  const artifact = manifest.distribution.artifact as FeaturePackageManifest['distribution']['artifact'] & {
    archiveFile?: string;
  };
  const archiveFile = artifact.archiveFile ?? `${manifest.productSku}-${artifact.version}.tgz`;
  if (!archiveFile || path.basename(archiveFile) !== archiveFile || archiveFile.includes('/') || archiveFile.includes('\\')) {
    throw new Error(`Package archive filename is invalid: ${archiveFile || 'missing'}`);
  }
  return archiveFile;
}

async function downloadPackageArchive(
  manifest: FeaturePackageManifest,
  archiveFile: string,
  download: FeaturePackageArtifactDownloadRequest,
): Promise<{ archivePath: string; cleanupDir: string }> {
  const url = download.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unsupported package artifact download URL for ${manifest.id}: ${url || 'missing'}`);
  }
  const cleanupDir = await mkdtemp(path.join(tmpdir(), `codeagent-${manifest.id}-archive-`));
  const archivePath = path.join(cleanupDir, archiveFile);
  const response = await fetch(url, {
    headers: normalizeDownloadHeaders(download.headers),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Package artifact download failed for ${manifest.id}: ${response.status} ${detail || response.statusText}`);
  }
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  return { archivePath, cleanupDir };
}

function normalizeDownloadHeaders(headers?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (/^[A-Za-z0-9-]+$/.test(key) && typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
}

async function persistDownloadedArchive(
  archivePath: string,
  manifest: FeaturePackageManifest,
  archiveFile: string,
  version: string,
): Promise<string> {
  const archiveInstallPath = path.join(
    getCodeAgentConfigHomeDir(),
    'feature-package-archives',
    manifest.id,
    version,
    archiveFile,
  );
  await mkdir(path.dirname(archiveInstallPath), { recursive: true });
  await copyFile(archivePath, archiveInstallPath);
  return archiveInstallPath;
}

function packageDistRootCandidates(): string[] {
  const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();
  const candidates = [
    process.env.CODEAGENT_FEATURE_PACKAGE_DIST_ROOT,
    path.resolve(moduleDir, '../../../code-agent-packages/dist-feature-packages'),
    path.resolve(moduleDir, '../../code-agent-packages/dist-feature-packages'),
    path.resolve(process.cwd(), '../code-agent-packages/dist-feature-packages'),
    path.resolve(process.cwd(), 'dist-feature-packages'),
  ].filter((entry): entry is string => Boolean(entry));
  return Array.from(new Set(candidates));
}

function extractTarball(archivePath: string, destination: string): void {
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', destination], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to extract package archive: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

async function readArtifactDescriptor(root: string): Promise<Record<string, unknown>> {
  const descriptorPath = path.join(root, 'artifact.json');
  const parsed = parseJsonPayload(await readFile(descriptorPath, 'utf8'));
  if (!isPlainObject(parsed)) {
    throw new Error('Package archive artifact.json is invalid.');
  }
  return parsed;
}

function verifyArtifactDescriptor(
  manifest: FeaturePackageManifest,
  descriptor: Record<string, unknown>,
): void {
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
  const verified = verify(
    null,
    Buffer.from(signingPayloadJson),
    createPublicKey(trustedPublicKey),
    Buffer.from(signature, 'base64'),
  );
  if (!verified) {
    throw new Error('Package signature verification failed.');
  }
}

function artifactSigningPayload(descriptor: Record<string, unknown>): Record<string, unknown> {
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

async function verifyArtifactFiles(root: string, descriptor: Record<string, unknown>): Promise<void> {
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
    const actualSha = await sha256File(path.join(root, file));
    if (actualSha !== expectedSha) {
      throw new Error(`Package file SHA-256 mismatch for ${file}.`);
    }
  }
}

function isSafeArtifactPath(value: string): boolean {
  return !path.isAbsolute(value) &&
    !value.split(/[\\/]+/).includes('..') &&
    value !== 'artifact.json';
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseJsonPayload(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
