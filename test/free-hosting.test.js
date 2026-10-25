import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { ensureCountryDatabase, releaseMonths, validateCountryDatabase } from '../lib/download-geoip.js';
import { createClientIpResolver } from '../lib/client-ip.js';
import { createApp } from '../server.js';

test('monthly release calculation works across a year boundary', () => {
  assert.deepEqual(releaseMonths(new Date('2027-01-01T00:00:00Z')), ['2027-01', '2026-12']);
});

test('download validates before installation and caches the current month', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'atlas-geoip-'));
  try {
    const target = path.join(folder, 'country.mmdb');
    let requests = 0;
    const options = {
      now: new Date('2026-10-25T00:00:00Z'),
      fetchImpl: async url => { requests++; assert.match(url, /^https:\/\/download\.db-ip\.com\/free\/dbip-country-lite-2026-10\.mmdb\.gz$/); return new Response(gzipSync('test-fixture')); },
      validate: bytes => assert.equal(bytes.toString(), 'test-fixture')
    };
    assert.equal((await ensureCountryDatabase(target, options)).cached, false);
    assert.equal((await ensureCountryDatabase(target, options)).cached, true);
    assert.equal(requests, 1);
    assert.equal((await readFile(target)).toString(), 'test-fixture');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('404 for a new release uses the preceding month; invalid data is rejected', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'atlas-geoip-'));
  try {
    const target = path.join(folder, 'country.mmdb');
    const result = await ensureCountryDatabase(target, {
      now: new Date('2026-10-01T00:00:00Z'),
      fetchImpl: async url => url.includes('2026-10') ? new Response(null, { status: 404 }) : new Response(gzipSync('fixture')),
      validate: bytes => assert.equal(bytes.toString(), 'fixture')
    });
    assert.equal(result.release, '2026-09');
    await assert.rejects(ensureCountryDatabase(path.join(folder, 'bad.mmdb'), {
      fetchImpl: async () => new Response(gzipSync('not-an-mmdb'))
    }));
    await assert.rejects(readFile(path.join(folder, 'bad.mmdb')));
    assert.throws(() => validateCountryDatabase(Buffer.from('not-an-mmdb')));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('download fails closed for an HTTP error or oversized file', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'atlas-geoip-'));
  try {
    const target = path.join(folder, 'country.mmdb');
    await assert.rejects(ensureCountryDatabase(target, { fetchImpl: async () => new Response(null, { status: 503 }) }), /HTTP 503/);
    await assert.rejects(ensureCountryDatabase(target, { fetchImpl: async () => new Response('x', { headers: { 'content-length': '20000000' } }) }), /большой/);
    await assert.rejects(readFile(target));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

function request(peer, headers = {}, ip = peer) {
  return { socket: { remoteAddress: peer }, ip, get: key => headers[key] };
}
test('Render IP adapter requires private ingress and a single valid edge IP', () => {
  const render = createClientIpResolver({ render: true });
  assert.equal(render(request('10.2.3.4', { 'cf-connecting-ip': '8.8.8.8' })), '8.8.8.8');
  assert.equal(render(request('8.8.4.4', { 'cf-connecting-ip': '8.8.8.8' })), null);
  assert.equal(render(request('10.2.3.4', { 'cf-connecting-ip': '8.8.8.8,1.1.1.1' })), null);
  assert.equal(render(request('10.2.3.4', { 'x-forwarded-for': '8.8.8.8' })), null);
  assert.equal(createClientIpResolver()(request('127.0.0.1', { 'cf-connecting-ip': '8.8.8.8' })), '127.0.0.1');
});

test('Render path blocks KG despite spoofed XFF, allows another country, and serves health probes', async () => {
  const rules = { mode: 'denylist', countries: ['KG'], regions: [], unknownAction: 'deny' };
  const reader = { get: ip => ({ country: { iso_code: ip === '212.42.96.1' ? 'KG' : 'US' } }) };
  const server = createApp({ reader, rules, enabled: true, render: true }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(origin, { headers: { 'CF-Connecting-IP': '212.42.96.1', 'X-Forwarded-For': '8.8.8.8' } })).status, 403);
    assert.equal((await fetch(origin, { headers: { 'CF-Connecting-IP': '8.8.8.8' } })).status, 200);
    assert.equal((await fetch(origin)).status, 403);
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    assert.equal((await (await fetch(origin + '/healthz')).text()), 'ok');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
