// Forma Lab — a results page that opens on the phone and on any computer.
// Uploads the snapshots and a small page to Forma's file storage (Cloudflare R2, under lab/<author>/)
// and returns a private link (signed, valid 7 days). Uses no database. Without R2 settings it does nothing.
//
//   node share.mjs <results folder>      upload and print the link (batch.mjs calls this by itself)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const WEEK = 7 * 24 * 3600;
const FORMA_ENV = process.env.FORMA_ENV || '/root/forma/forma/.env';

async function r2Config() {
  const env = {...process.env};
  const text = await fs.readFile(FORMA_ENV, 'utf8').catch(() => '');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const {R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret} = env;
  if (!account || !key || !secret) return null;
  return {
    host: `${account}.r2.cloudflarestorage.com`,
    bucket: env.R2_BUCKET || 'forma',
    key, secret,
    author: (env.FORMA_AUTHOR || 'lab').toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  };
}

const sha = (data, enc = 'hex') => crypto.createHash('sha256').update(data).digest(enc);
const hmac = (k, data, enc) => crypto.createHmac('sha256', k).update(data).digest(enc);
const encPath = p => p.split('/').map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

// AWS Signature V4 query signing (what S3/R2 "presigned URLs" are), region "auto" for R2.
export function presign(cfg, method, objectKey, {expires = WEEK, now = new Date(), region = 'auto'} = {}) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const uri = cfg.bucket ? `/${cfg.bucket}/${encPath(objectKey)}` : `/${encPath(objectKey)}`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.key}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(q).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
  const canonical = [method, uri, query, `host:${cfg.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  let k = hmac('AWS4' + cfg.secret, day);
  k = hmac(k, region); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  return `https://${cfg.host}${uri}?${query}&X-Amz-Signature=${hmac(k, toSign, 'hex')}`;
}

async function upload(cfg, objectKey, body, contentType) {
  const res = await fetch(presign(cfg, 'PUT', objectKey, {expires: 900}), {method: 'PUT', body, headers: {'content-type': contentType}});
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export async function shareRun(dir, {scenarioText} = {}) {
  const cfg = await r2Config();
  if (!cfg) return null;
  const run = JSON.parse(await fs.readFile(path.join(dir, 'run.json'), 'utf8'));
  const rows = JSON.parse(await fs.readFile(path.join(dir, 'details.json'), 'utf8'));
  const prefix = `lab/${cfg.author}/${path.basename(dir)}`;
  const lang = run.plan?.setup?.languages?.[0] || 'en';
  const link = {};
  for (const r of rows) {
    for (const file of [...(r.shots?.styles || []), ...(r.shots?.preview || [])].filter(Boolean)) {
      await upload(cfg, `${prefix}/${file}`, await fs.readFile(path.join(dir, file)), 'image/png');
      link[file] = presign(cfg, 'GET', `${prefix}/${file}`);
    }
  }
  const img = (file, label) => file && link[file]
    ? `<figure><img loading="lazy" src="${esc(link[file])}" alt=""><figcaption>${label}</figcaption></figure>` : '';
  const verdict = name => (String(name || '').match(/ — ([✓~✗].*)$/) || [])[1] || '';
  const cards = rows.map(r => {
    const styles = r.styles?.output?.styles || [];
    const sc = r.scenario?.output?.scenario;
    return `<section><h2><span>#${r.no}</span> ${esc(r.brandName)} <small>${esc(verdict(r.campaignName))}</small></h2>
${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
${sc ? `<details${styles.length ? '' : ' open'}><summary>Script: ${esc(sc.theme || '')}</summary><pre>${esc(scenarioText ? scenarioText(sc, lang) : sc.idea || '')}</pre></details>` : ''}
${styles.length ? `<div class="grid">${styles.map((s, i) => img(r.shots?.styles?.[i], `<b>${r.no}.${i + 1}${i === r.chosenIndex ? ' ✓' : ''}</b> ${esc(s.name)}`)).join('')}</div>` : ''}
${r.shots?.preview ? `<div class="grid">${img(r.shots.preview[0], `<b>#${r.no} preview</b> · 2 s`)}${img(r.shots.preview[1], `<b>#${r.no} preview</b> · end`)}</div>` : ''}
</section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lab · ${esc(run.batch)}</title><style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--mute:#6b6a66;--line:#e3e1dc;--acc:#3355ff}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--ink:#eceae5;--mute:#a09e98;--line:#34332f;--acc:#8fa3ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px 16px 48px}h1{font-size:21px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 16px;font-size:13px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 14px}
h2{font-size:17px;margin:0 0 6px}h2 span{color:var(--acc)}h2 small{font-weight:600;color:var(--mute)}
pre{white-space:pre-wrap;font-size:12.5px;background:var(--bg);padding:8px 10px;border-radius:8px}summary{cursor:pointer;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0 0}
figure{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}img{width:100%;display:block;background:#fff}
figcaption{padding:6px 8px;font-size:12.5px}.err{color:#b3261e}
</style></head><body><main><h1>${esc(run.batch)}${run.demo ? ' · demo' : ''}</h1>
<p class="sub">${esc(run.about)}<br>${esc(String(run.startedAt).slice(0, 16).replace('T', ' '))} · link valid 7 days · write comments in the Forma Lab chat using the numbers (#3, 3.2)</p>
${cards}</main></body></html>`;
  await upload(cfg, `${prefix}/index.html`, html, 'text/html; charset=utf-8');
  const url = presign(cfg, 'GET', `${prefix}/index.html`);
  await fs.writeFile(path.join(dir, 'link.txt'), url + '\n');
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.log('Usage: node share.mjs <results folder>'); process.exit(1); }
  shareRun(path.resolve(dir))
    .then(url => console.log(url ? `Link (phone and computer, 7 days):\n${url}` : 'No R2 settings in Forma .env — page stays on this computer only.'))
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
}
