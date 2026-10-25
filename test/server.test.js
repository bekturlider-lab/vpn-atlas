import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { readFile } from 'node:fs/promises';
import { geoblockEnabled } from '../lib/settings.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const rules = { mode: 'denylist', countries: ['DE'], regions: [], unknownAction: 'deny' };
const reader = { get: () => ({ country: { iso_code: 'DE' } }) };

test('educational mode serves HTML, JS and runtime status without a GeoIP database', async () => {
  await withServer(createApp(), async origin => {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /VPN Atlas/);
    assert.equal((await fetch(origin + '/js/policy.js')).status, 200);
    assert.equal((await fetch(origin + '/api/status')).status, 200);
    assert.equal((await (await fetch(origin + '/api/status')).json()).geoblockEnabled, false);
    assert.equal((await fetch(origin + '/config/access-rules.json')).status, 404);
    const archive = await fetch(origin + '/downloads/vpn-atlas-node.zip');
    assert.equal(archive.status, 200);
    assert.match(archive.headers.get('content-disposition'), /vpn-atlas-node.zip/);
    assert.equal(Buffer.from(await archive.arrayBuffer()).readUInt32LE(0), 0x04034b50);
  });
});

test('shipping policy returns 403 for KG and allows a known non-KG exit country', async () => {
  const shippingRules = JSON.parse(await readFile(new URL('../config/access-rules.json', import.meta.url), 'utf8'));
  const entries = {
    '8.8.8.8': { country: { iso_code: 'KG' } },
    '1.1.1.1': { country: { iso_code: 'DE' } },
    '2001:4860:4860::8888': { country: { iso_code: 'KG' } }
  };
  // Addresses and countries here are test fixtures, not a real GeoIP database.
  const fixture = { get: ip => entries[ip] ?? null };
  await withServer(createApp({ reader: fixture, rules: shippingRules, enabled: true, proxies: ['127.0.0.1/32'] }), async origin => {
    for (const ip of ['8.8.8.8', '2001:4860:4860::8888']) {
      for (const route of ['/', '/css/style.css', '/js/app.js', '/downloads/vpn-atlas-node.zip', '/api/status']) {
        const response = await fetch(origin + route, { headers: { 'X-Forwarded-For': ip } });
        assert.equal(response.status, 403, `${ip} ${route}`);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
      }
    }
    assert.equal((await fetch(origin, { headers: { 'X-Forwarded-For': '1.1.1.1' } })).status, 200);
    assert.equal((await fetch(origin)).status, 403); // Unknown loopback: deny.
  });
});

test('geoblock defaults to enabled and production refuses an accidental disable', () => {
  assert.equal(geoblockEnabled({}), true);
  assert.equal(geoblockEnabled({ NODE_ENV: 'production' }), true);
  assert.throws(() => geoblockEnabled({ NODE_ENV: 'production', GEOBLOCK_ENABLED: 'false' }), /production/);
  assert.equal(geoblockEnabled({ GEOBLOCK_ENABLED: 'false' }), false);
});

test('production startup does not serve the site if its GeoIP database is missing', () => {
  const processResult = spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production', GEOBLOCK_ENABLED: 'true', GEOIP_DB_PATH: '/nonexistent/atlas-test.mmdb' },
    encoding: 'utf8', timeout: 5000
  });
  assert.equal(processResult.status, 1);
  assert.match(processResult.stderr, /GeoIP/);
});

test('demo command refuses to expose an unprotected production instance', () => {
  const processResult = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/demo.mjs', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 5000
  });
  assert.equal(processResult.status, 1);
  assert.match(processResult.stderr, /локального просмотра/);
});
test('direct clients cannot spoof X-Forwarded-For to bypass unknown-address restriction', async () => {
  await withServer(createApp({ reader, rules, enabled: true }), async origin => {
    const response = await fetch(origin, { headers: { 'X-Forwarded-For': '8.8.8.8' } });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /Доступ ограничен/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(origin + '/js/app.js')).status, 403);
  });
});
test('trusted proxy passes real lookup through country gate', async () => {
  await withServer(createApp({ reader, rules, enabled: true, proxies: ['127.0.0.1/32'] }), async origin => {
    const response = await fetch(origin, { headers: { 'X-Forwarded-For': '8.8.8.8' } });
    assert.equal(response.status, 403);
  });
});
test('allowed country reaches page and spoofed query cannot change server rules', async () => {
  const allowed = { get: () => ({ country: { iso_code: 'KG' } }) };
  await withServer(createApp({ reader: allowed, rules, enabled: true, proxies: ['127.0.0.1/32'] }), async origin => {
    assert.equal((await fetch(origin + '/?country=DE&mode=allowlist', { headers: { 'X-Forwarded-For': '8.8.8.8' } })).status, 200);
  });
});
test('GeoIP runtime failure returns 503, never a fabricated decision', async () => {
  const broken = { get: () => { throw new Error('broken database'); } };
  await withServer(createApp({ reader: broken, rules, enabled: true, proxies: ['127.0.0.1/32'] }), async origin => {
    assert.equal((await fetch(origin, { headers: { 'X-Forwarded-For': '8.8.8.8' } })).status, 503);
  });
});
