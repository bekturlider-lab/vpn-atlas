// Shared by the browser simulator and Express. No client input changes server rules.
export function validateRules(rules) {
  if (!rules || !['denylist', 'allowlist'].includes(rules.mode)) throw new Error('mode: denylist или allowlist');
  if (!['allow', 'deny'].includes(rules.unknownAction)) throw new Error('unknownAction: allow или deny');
  if (!Array.isArray(rules.countries) || !rules.countries.every(x => typeof x === 'string' && /^[A-Z]{2}$/.test(x))) throw new Error('countries: массив двухбуквенных кодов ISO');
  if (!Array.isArray(rules.regions) || !rules.regions.every(x => typeof x === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(x))) throw new Error('regions: массив кодов вида DE-BE');
  return rules;
}

export function evaluateAccess(location, rules) {
  validateRules(rules);
  const country = location?.country || null;
  const region = location?.region || null;
  const unknown = () => ({ allowed: rules.unknownAction === 'allow', reason: 'unknown', matched: null });
  if (!country) return unknown();
  // A whole-country rule takes priority, even when the region is unknown.
  if (rules.countries.includes(country)) return { allowed: rules.mode === 'allowlist', reason: 'country', matched: country };
  if (region && rules.regions.includes(region)) return { allowed: rules.mode === 'allowlist', reason: 'region', matched: region };
  // If a relevant regional rule cannot be evaluated, use explicit unknown policy.
  if (!region && rules.regions.some(x => x.startsWith(country + '-'))) return unknown();
  return { allowed: rules.mode === 'denylist', reason: 'default', matched: null };
}
