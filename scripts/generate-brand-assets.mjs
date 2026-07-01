#!/usr/bin/env node

import { execFile } from 'child_process';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resourcesDir = path.join(rootDir, 'electron', 'resources');
const svgPath = path.join(resourcesDir, 'codeagent-logo.svg');
const iconsetDir = path.join(resourcesDir, 'CodeAgent.iconset');

const svg = await readFile(svgPath);

async function renderPng(size, outputPath) {
  await sharp(svg)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(outputPath);
}

async function pngBuffer(size) {
  return sharp(svg)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
}

function createIco(images) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  let offset = headerSize + directorySize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const directories = [];
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.buffer.length;
    directories.push(entry);
  }

  return Buffer.concat([header, ...directories, ...images.map(image => image.buffer)]);
}

await mkdir(resourcesDir, { recursive: true });
await renderPng(1024, path.join(resourcesDir, 'icon.png'));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = await Promise.all(icoSizes.map(async size => ({
  size,
  buffer: await pngBuffer(size),
})));
await writeFile(path.join(resourcesDir, 'icon.ico'), createIco(icoImages));

await rm(iconsetDir, { recursive: true, force: true });
await mkdir(iconsetDir, { recursive: true });
const iconsetSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [filename, size] of iconsetSizes) {
  await renderPng(size, path.join(iconsetDir, filename));
}

try {
  await execFileAsync('iconutil', [
    '-c',
    'icns',
    iconsetDir,
    '-o',
    path.join(resourcesDir, 'icon.icns'),
  ]);
} finally {
  await rm(iconsetDir, { recursive: true, force: true });
}

console.log('Generated CodeAgent brand assets in electron/resources');
