import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openGeoDatabase } from './lib/geo.js';
import { trustedProxies } from './lib/ip.js';
import { validateRules } from './public/js/policy.js';
import { createGeoBlock } from './middleware/geo-block.js';
import { createProjectArchive } from './lib/project-archive.js';
import { geoblockEnabled } from './lib/settings.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

export function createApp({ reader = null, rules = null, enabled = false, proxies = false } = {}) {
  if (enabled && (!reader || !rules)) throw new Error('Для геоблокировки нужны GeoIP-база и правила');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', proxies);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    next();
  });
  // No query, cookie or body parameter can bypass or change server-side rules.
  // The gate applies before ALL public assets and routes.
  if (enabled) app.use(createGeoBlock({ reader, rules, forbiddenPage: path.join(PUBLIC, '403.html') }));
  app.get('/api/status', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ runtime: 'node-express', geoblockEnabled: enabled, geoDatabaseLoaded: Boolean(reader) });
  });
  let download;
  app.get('/downloads/vpn-atlas-node.zip', async (req, res) => {
    download ??= createProjectArchive().catch(error => { download = null; throw error; });
    res.set('Cache-Control', 'no-store').attachment('vpn-atlas-node.zip').send(await download);
  });
  app.use(express.static(PUBLIC));
  app.use((req, res) => res.status(404).type('text').send('Страница не найдена. Откройте главную страницу /'));
  return app;
}

export async function start() {
  const enabled = geoblockEnabled();
  const rules = validateRules(JSON.parse(await readFile(path.join(ROOT, 'config/access-rules.json'), 'utf8')));
  const reader = enabled ? await openGeoDatabase(path.resolve(ROOT, process.env.GEOIP_DB_PATH || 'data/GeoLite2-City.mmdb')) : null;
  const app = createApp({ reader, rules, enabled, proxies: trustedProxies(process.env.TRUSTED_PROXIES) });
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535');
  const server = app.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`VPN Atlas: http://localhost:${port}`);
    console.log(enabled ? 'Геоблокировка включена. Локальные адреса используют unknownAction.' : 'Учебный режим. Реальная геоблокировка выключена.');
  });
  server.on('error', error => { console.error('Не удалось запустить сервер:', error.message); process.exitCode = 1; });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch(error => { console.error('Ошибка настройки:', error.message); process.exitCode = 1; });
}
