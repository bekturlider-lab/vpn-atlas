import ipaddr from 'ipaddr.js';
import { normalizeIp, isPublicIp } from './ip.js';

export function createClientIpResolver({ render = false } = {}) {
  if (!render) return req => req.ip;
  return req => {
    // Render public traffic passes Cloudflare, then Render's private load balancer.
    // Never enable this adapter on a directly reachable origin or another platform.
    const peer = normalizeIp(req.socket.remoteAddress);
    if (!peer || !['private', 'loopback', 'uniqueLocal'].includes(ipaddr.parse(peer).range())) return null;
    const raw = req.get('cf-connecting-ip');
    const ip = normalizeIp(typeof raw === 'string' ? raw.trim() : '');
    // A missing or malformed edge header is unknown, never a proxy IP fallback.
    return ip && isPublicIp(ip) ? ip : null;
  };
}
