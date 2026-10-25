import ipaddr from 'ipaddr.js';

export function normalizeIp(value) {
  if (typeof value !== 'string' || !ipaddr.isValid(value)) return null;
  const address = ipaddr.parse(value);
  if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) return address.toIPv4Address().toString();
  return address.toString();
}

export function isPublicIp(value) {
  const ip = normalizeIp(value);
  return Boolean(ip && ipaddr.parse(ip).range() === 'unicast');
}

export function trustedProxies(value = '') {
  if (!value.trim()) return false;
  const values = value.split(',').map(x => x.trim());
  for (const item of values) {
    if (!item) throw new Error('Пустой адрес в TRUSTED_PROXIES');
    try { item.includes('/') ? ipaddr.parseCIDR(item) : ipaddr.parse(item); }
    catch { throw new Error('TRUSTED_PROXIES принимает только IP или CIDR, не true и не количество переходов'); }
  }
  return values;
}
