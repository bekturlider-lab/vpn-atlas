import { evaluateAccess, validateRules } from '../public/js/policy.js';
import { locate } from '../lib/geo.js';

export function createGeoBlock({ reader, rules, forbiddenPage, clientIp = req => req.ip }) {
  validateRules(rules);
  return (req, res, next) => {
    try {
      const result = evaluateAccess(locate(reader, clientIp(req)), rules);
      // Never cache a geographically personalized decision in a shared cache.
      res.set('Cache-Control', 'private, no-store');
      if (!result.allowed) return res.status(403).sendFile(forbiddenPage);
      next();
    } catch {
      res.status(503).set('Cache-Control', 'no-store').type('text').send('GeoIP-проверка временно недоступна. Обратитесь к владельцу сайта.');
    }
  };
}
