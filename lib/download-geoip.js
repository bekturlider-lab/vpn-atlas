import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import maxmind from 'maxmind';

export function releaseMonths(now = new Date()) {
  return [0, 1].map(offset => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function validateCountryDatabase(bytes) {
  const reader = new maxmind.Reader(bytes);
  if (!reader.metadata.databaseType.toLowerCase().includes('country')) throw new Error('Ожидалась MMDB-база стран');
  if (!/^[A-Z]{2}$/.test(reader.get('8.8.8.8')?.country?.iso_code || '')) throw new Error('MMDB не содержит ожидаемого поля country.iso_code');
}

async function boundedBody(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) throw new Error('Слишком большой архив GeoIP');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Слишком большой архив GeoIP');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

export async function ensureCountryDatabase(file, {
  fetchImpl = globalThis.fetch, now = new Date(), validate = validateCountryDatabase
} = {}) {
  const months = releaseMonths(now);
  const metadataFile = `${file}.release.json`;
  try {
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
    if (metadata.release === months[0]) {
      validate(await readFile(file));
      return { release: metadata.release, cached: true };
    }
  } catch { /* Missing, outdated or invalid cache: download and verify again. */ }
  await mkdir(path.dirname(file), { recursive: true });
  for (const release of months) {
    // Public monthly download: no account, API key, cookies, or visitor IP is sent.
    const url = `https://download.db-ip.com/free/dbip-country-lite-${release}.mmdb.gz`;
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(25000) });
    if (response.status === 404) continue; // At month start the preceding release may still be current.
    if (!response.ok) throw new Error(`Загрузка бесплатной GeoIP-базы: HTTP ${response.status}`);
    const packed = await boundedBody(response, 16 * 1024 * 1024);
    const database = gunzipSync(packed, { maxOutputLength: 64 * 1024 * 1024 });
    validate(database);
    const temp = `${file}.${process.pid}.tmp`;
    try {
      await writeFile(temp, database, { mode: 0o600 });
      await rename(temp, file);
    } finally { await unlink(temp).catch(() => {}); }
    await writeFile(metadataFile, JSON.stringify({ release, source: 'https://db-ip.com', license: 'CC-BY-4.0' }), { mode: 0o600 });
    return { release, cached: false };
  }
  throw new Error('Бесплатная GeoIP-база пока недоступна. Сервер не будет выдавать сайт без проверки.');
}
