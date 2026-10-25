import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCountryDatabase } from '../lib/download-geoip.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(root, process.env.GEOIP_DB_PATH || 'data/dbip-country-lite.mmdb');
try {
  const info = await ensureCountryDatabase(file);
  console.log(`DB-IP Country Lite ${info.release}: ${info.cached ? 'проверенный кеш' : 'база загружена'}.`);
} catch (error) { console.error('GeoIP:', error.message); process.exitCode = 1; }
