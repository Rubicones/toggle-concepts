// Small client for the local Forma Studio API (http://127.0.0.1:4317).
// No request timeouts: a single Forma step can run for many minutes.
//
// As a library:   import {api} from './api.mjs'; await api('GET', '/api/campaigns?limit=5')
// From the shell: node api.mjs GET /api/campaigns?limit=5
//                 node api.mjs POST /api/campaigns/<id>/styles '{"revise":"all","feedback":"..."}'
import http from 'node:http';

export const BASE = process.env.FORMA_URL || 'http://127.0.0.1:4317';

export function api(method, route, body, {raw = false, contentType} = {}) {
  const url = new URL(route, BASE);
  const payload = body === undefined ? null
    : Buffer.isBuffer(body) ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = {'x-forma': 'studio', host: url.host};
  if (payload) {
    headers['content-type'] = contentType || (Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json');
    headers['content-length'] = payload.length;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method, headers}, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (raw) return resolve({status: res.statusCode, text});
        let data;
        try { data = text ? JSON.parse(text) : null; } catch { data = {error: text}; }
        if (res.statusCode >= 400) {
          const err = new Error((data && (data.error || data.message)) || `HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.setTimeout(0);
    req.on('error', err => {
      if (err.code === 'ECONNREFUSED') err.message = `Forma is not running at ${BASE}. Start it with the "Forma Studio" icon first.`;
      reject(err);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// Find a campaign by id or by (part of) its name.
// Names are looked up in the lab's own results (run.json files) first, so no database listing is needed;
// only if that fails, one page of the newest campaigns is checked.
export async function findCampaign(query) {
  if (/^[0-9a-f-]{36}$/i.test(query)) return api('GET', `/api/campaigns/${query}`);
  const q = String(query).toLowerCase();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = process.env.LAB_OUT || '/mnt/c/toggle/lab';
  const dirs = (await fs.readdir(root).catch(() => [])).sort().reverse();
  for (const d of dirs) {
    const run = await fs.readFile(path.join(root, d, 'run.json'), 'utf8').then(JSON.parse).catch(() => null);
    const hit = run?.items?.find(i => i.campaignId && (i.campaignName || '').toLowerCase().includes(q));
    if (hit) return api('GET', `/api/campaigns/${hit.campaignId}`);
  }
  const res = await api('GET', '/api/campaigns?limit=30');
  const hit = res.items.find(c => (c.name || '').toLowerCase().includes(q));
  if (hit) return api('GET', `/api/campaigns/${hit.id}`);
  throw new Error(`No campaign matches "${query}". Use the campaign id (it is in the results page / run.json).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method = 'GET', route = '/api/status', body] = process.argv.slice(2);
  api(method.toUpperCase(), route, body)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}
