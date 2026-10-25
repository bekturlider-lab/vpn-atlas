import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccess, validateRules } from '../public/js/policy.js';
import { normalizeIp, isPublicIp, trustedProxies } from '../lib/ip.js';
import { locate, openGeoDatabase } from '../lib/geo.js';

const deny = { mode: 'denylist', countries: ['DE'], regions: [], unknownAction: 'deny' };

test('denylist blocks selected country and allows another', () => {
  assert.equal(evaluateAccess({ country: 'DE' }, deny).allowed, false);
  assert.equal(evaluateAccess({ country: 'KG' }, deny).allowed, true);
});
test('allowlist allows only selected country', () => {
  const rule = { ...deny, mode: 'allowlist', countries: ['KG'] };
  assert.equal(evaluateAccess({ country: 'KG' }, rule).allowed, true);
  assert.equal(evaluateAccess({ country: 'DE' }, rule).allowed, false);
});
test('empty denylist allows known countries; empty allowlist denies them', () => {
  assert.equal(evaluateAccess({ country: 'US' }, { ...deny, countries: [] }).allowed, true);
  assert.equal(evaluateAccess({ country: 'US' }, { ...deny, countries: [], mode: 'allowlist' }).allowed, false);
});
test('unknown country follows the explicit unknown action', () => {
  assert.equal(evaluateAccess(null, deny).allowed, false);
  assert.equal(evaluateAccess(null, { ...deny, unknownAction: 'allow' }).allowed, true);
});
test('regional rule checks country-qualified code', () => {
  const rule = { ...deny, countries: [], regions: ['DE-BE'] };
  assert.equal(evaluateAccess({ country: 'DE', region: 'DE-BE' }, rule).allowed, false);
  assert.equal(evaluateAccess({ country: 'DE', region: 'DE-BY' }, rule).allowed, true);
  assert.equal(evaluateAccess({ country: 'US', region: 'US-CA' }, rule).allowed, true);
});
test('missing relevant region uses unknown policy; whole-country rule has priority', () => {
  const rule = { mode: 'allowlist', countries: [], regions: ['DE-BE'], unknownAction: 'deny' };
  assert.equal(evaluateAccess({ country: 'DE' }, rule).reason, 'unknown');
  assert.equal(evaluateAccess({ country: 'DE' }, { ...rule, countries: ['DE'] }).allowed, true);
  assert.equal(evaluateAccess({ country: 'DE' }, { ...rule, unknownAction: 'allow' }).allowed, true);
});
test('VPN example: changing effective address changes result', () => {
  const rule = { ...deny, countries: ['KG'] };
  assert.equal(evaluateAccess({ country: 'KG' }, rule).allowed, false);
  assert.equal(evaluateAccess({ country: 'DE' }, rule).allowed, true);
});
test('invalid config fails instead of silently opening access', () => {
  assert.throws(() => validateRules({ ...deny, countries: 'DE' }));
  assert.throws(() => validateRules({ ...deny, mode: 'oops' }));
  assert.throws(() => validateRules({ ...deny, regions: ['BE'] }));
});
test('IPv4 and IPv6 are normalized and local/reserved IPs are not geolocated', () => {
  assert.equal(normalizeIp('::ffff:8.8.8.8'), '8.8.8.8');
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2001:4860:4860::8888'), true);
  for (const ip of ['::1', '127.0.0.1', '10.0.0.1', '192.168.1.1', 'fc00::1', '169.254.1.2', 'not-an-ip']) assert.equal(isPublicIp(ip), false);
});
test('trusted proxy configuration accepts only explicit IP/CIDR', () => {
  assert.equal(trustedProxies(''), false);
  assert.deepEqual(trustedProxies('127.0.0.1/32,::1/128'), ['127.0.0.1/32', '::1/128']);
  assert.throws(() => trustedProxies('true'));
});
test('geo lookup extracts country and subdivision without retaining the address', () => {
  const reader = { get: () => ({ country: { iso_code: 'DE' }, subdivisions: [{ iso_code: 'BE' }] }) };
  assert.deepEqual(locate(reader, '8.8.8.8'), { country: 'DE', region: 'DE-BE', source: 'geoip' });
  assert.equal(locate(reader, '127.0.0.1').source, 'local-or-reserved');
});
test('missing .mmdb produces actionable configuration error', async () => {
  await assert.rejects(openGeoDatabase('/nonexistent/vpn-atlas-db.mmdb'), /GEOIP_DB_PATH/);
});
