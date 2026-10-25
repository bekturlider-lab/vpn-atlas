// Small standard ZIP writer (DEFLATE). Only an explicit source allowlist is exported.
// No .env, .mmdb, node_modules, Site metadata, runtime or repository data.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const topFiles = ['package.json', 'package-lock.json', 'server.js', 'README.md', 'GITHUB.md', '.env.example', '.env.production.example', '.gitignore'];
const sourceDirs = ['config', 'middleware', 'lib', 'public', 'scripts', 'test'];

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function walk(relative) {
  const result = [];
  for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'downloads' || entry.name.endsWith('.mmdb')) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

export async function createProjectArchive() {
  const files = [...topFiles, 'data/README.md'];
  for (const directory of sourceDirs) files.push(...await walk(directory));
  const localParts = [];
  const directoryParts = [];
  let offset = 0;
  for (const relative of files) {
    const name = Buffer.from(`vpn-atlas/${relative}`, 'utf8');
    const original = await readFile(path.join(root, relative));
    const compressed = deflateRawSync(original);
    const crc = checksum(original);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x5d59, 12); // Stable DOS date, independent of filesystem timestamps.
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(original.length, 22);
    header.writeUInt16LE(name.length, 26);
    localParts.push(header, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0x5d59, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(original.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    directoryParts.push(central, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(directoryParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}
