export function geoblockEnabled(env = process.env) {
  const value = env.GEOBLOCK_ENABLED ?? 'true';
  if (!['true', 'false'].includes(value)) throw new Error('GEOBLOCK_ENABLED: только true или false');
  if (env.NODE_ENV === 'production' && value !== 'true') {
    throw new Error('В production отключать геоблокировку нельзя. Задайте GEOBLOCK_ENABLED=true.');
  }
  return value === 'true';
}
