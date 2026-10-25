import maxmind from 'maxmind';
import { isPublicIp, normalizeIp } from './ip.js';

export async function openGeoDatabase(file) {
  try { return await maxmind.open(file, { watchForUpdates: false }); }
  catch { throw new Error('Не удалось открыть GeoIP-базу. Проверьте GEOIP_DB_PATH и файл .mmdb. Инструкция: data/README.md'); }
}

export function locate(reader, value) {
  const ip = normalizeIp(value);
  if (!ip || !isPublicIp(ip)) return { country: null, region: null, source: 'local-or-reserved' };
  const record = reader.get(ip);
  const country = record?.country?.iso_code || null;
  const subdivision = record?.subdivisions?.[0]?.iso_code || null;
  return { country, region: country && subdivision ? `${country}-${subdivision}` : null, source: 'geoip' };
}
