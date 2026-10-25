// The hosted preview is static. The downloadable project uses Express.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createProjectArchive } from '../lib/project-archive.js';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await mkdir('dist/downloads', { recursive: true });
await writeFile('dist/downloads/vpn-atlas-node.zip', await createProjectArchive());
console.log('Static educational site prepared in dist/. Express runs via npm start.');
