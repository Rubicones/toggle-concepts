// Forma Lab — run a batch of campaigns for made-up brands and build a results page.
//
//   node batch.mjs batches/quick.json                 run a batch
//   node batch.mjs batches/quick.json --demo          same, free demo mode (checks the plumbing)
//   node batch.mjs batches/full.json --brands lumo,grit --parallel 1 --stop-after styles
//   node batch.mjs --report <results folder>          rebuild the page (e.g. after revisions)
//
// Only talks to the local Forma API. Never edits Forma's code or data files directly.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {api, BASE} from './api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STEPS = ['scenario', 'styles', 'preview', 'final'];

function args(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') out.demo = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'batch';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const secs = ms => ms == null ? '' : ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${Math.round(ms % 60000 / 1000)} s`;

async function outRoot() {
  if (process.env.LAB_OUT) return process.env.LAB_OUT;
  try { await fs.access('/mnt/c/toggle'); return '/mnt/c/toggle/lab'; } catch { return path.join(here, 'results'); }
}

// A brand is brands/<slug>.md, or a folder brands/<slug>/ with a brief .md and any files (logo, photos, PDF guide).
async function loadBrands(wanted) {
  const dir = path.join(here, 'brands');
  const list = [];
  for (const e of await fs.readdir(dir, {withFileTypes: true})) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const id = e.name.replace(/\.md$/, '');
    if (e.isFile() && e.name.endsWith('.md')) {
      list.push({id, files: [{name: 'brief.md', abs: path.join(dir, e.name)}]});
    } else if (e.isDirectory()) {
      const files = [];
      for (const f of await fs.readdir(path.join(dir, e.name), {recursive: true, withFileTypes: true})) {
        if (!f.isFile() || f.name.startsWith('.')) continue;
        const abs = path.join(f.parentPath, f.name);
        files.push({name: path.relative(path.join(dir, e.name), abs).split(path.sep).join('/'), abs});
      }
      if (files.length) list.push({id, files});
    }
  }
  for (const b of list) {
    const md = b.files.find(f => f.name.endsWith('.md'));
    const text = md ? await fs.readFile(md.abs, 'utf8') : '';
    b.name = (text.match(/^#\s+(.+)$/m)?.[1] || b.id).trim();
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  if (!wanted || wanted === 'all') return list;
  const ids = Array.isArray(wanted) ? wanted : String(wanted).split(',').map(s => s.trim()).filter(Boolean);
  const missing = ids.filter(id => !list.some(b => b.id === id));
  if (missing.length) throw new Error(`Unknown brand(s): ${missing.join(', ')}. Brands are in ${dir}`);
  return ids.map(id => list.find(b => b.id === id));
}

async function runOne(brand, plan, item, save) {
  const t = {};
  const step = async (name, fn) => {
    const t0 = Date.now();
    item.now = name; await save();
    try { return await fn(); } finally { t[name] = (t[name] || 0) + Date.now() - t0; item.timings = t; }
  };
  try {
    const {id: project} = await api('POST', '/api/projects');
    for (const f of brand.files) {
      await api('PUT', `/api/projects/${project}/file?name=${encodeURIComponent(f.name)}`, await fs.readFile(f.abs));
    }
    const setup = {...plan.setup, ...(plan.overrides?.[brand.id] || {})};
    const camp = await api('POST', '/api/campaigns', {project, name: `LAB ${plan.label} · ${brand.name}`, setup});
    Object.assign(item, {campaignId: camp.id, campaignName: camp.name});
    await save();

    const sc = await step('scenario', () => api('POST', `/api/campaigns/${camp.id}/scenario`, {notes: plan.notes || ''}));
    let needs = sc.campaign?.steps?.scenario?.needs || [];
    if (needs.includes('translation')) await step('translate', () => api('POST', `/api/campaigns/${camp.id}/translate`, {}));
    if (needs.includes('cuts')) await step('cuts', () => api('POST', `/api/campaigns/${camp.id}/cuts`, {}));
    if (sc.validation?.errors?.length) {
      item.status = 'blocked';
      item.error = 'Script has validation errors: ' + sc.validation.errors.map(e => e.message || e).join('; ');
      return;
    }
    await step('approve', () => api('POST', `/api/campaigns/${camp.id}/approve`, {step: 'scenario'}));
    if (plan.stopAfter === 'scenario') return (item.status = 'done');

    await step('styles', () => api('POST', `/api/campaigns/${camp.id}/styles`, {}));
    if (plan.stopAfter === 'styles') return (item.status = 'done');

    await step('choose', () => api('POST', `/api/campaigns/${camp.id}/styles/choose`, {index: plan.choose ?? 0}));
    await step('preview', () => api('POST', `/api/campaigns/${camp.id}/preview`, {}));
    if (plan.stopAfter === 'preview') return (item.status = 'done');

    await step('approve', () => api('POST', `/api/campaigns/${camp.id}/approve`, {step: 'preview'}));
    await step('final', () => api('POST', `/api/campaigns/${camp.id}/final`, {}));
    item.status = 'done';
  } catch (err) {
    item.status = 'error';
    item.error = `${item.now || 'start'}: ${err.message}`;
  } finally {
    item.now = null;
    item.finishedAt = new Date().toISOString();
    await save();
  }
}

async function runBatch(file, opt) {
  const batch = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  const setup = structuredClone(batch.setup);
  if (opt.demo) setup.provider = {mode: 'demo'};
  const plan = {
    label: batch.name || path.basename(file, '.json'),
    setup,
    notes: batch.notes || '',
    stopAfter: opt['stop-after'] || batch.stopAfter || 'preview',
    choose: batch.choose ?? 0,
    overrides: opt.demo ? Object.fromEntries(Object.entries(batch.overrides || {}).map(([k, v]) => [k, {...v, provider: {mode: 'demo'}}])) : batch.overrides || {},
  };
  if (!STEPS.includes(plan.stopAfter)) throw new Error(`stopAfter must be one of: ${STEPS.join(', ')}`);
  const brands = await loadBrands(opt.brands || batch.brands);
  const parallel = Math.max(1, Number(opt.parallel || batch.parallel || 1));

  const status = await api('GET', '/api/status');
  const mode = setup.provider?.mode || 'demo';
  if (mode === 'claude' && (setup.provider.billing || 'subscription') === 'subscription' && !status.claudeSubscription) {
    throw new Error('Forma is not signed in to your Claude subscription. Run Update-Forma.cmd once, then try again.');
  }

  const dir = path.join(await outRoot(), `${stamp()}-${slug(plan.label)}${opt.demo ? '-demo' : ''}`);
  await fs.mkdir(dir, {recursive: true});
  const run = {
    batch: plan.label, about: batch.about || '', file: path.basename(file), demo: !!opt.demo,
    startedAt: new Date().toISOString(), forma: BASE, plan,
    items: brands.map(b => ({brand: b.id, brandName: b.name, status: 'waiting'})),
  };
  let writing = Promise.resolve();
  const save = () => (writing = writing.then(() => fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(run, null, 2))));
  await save();

  console.log(`Batch "${plan.label}": ${brands.length} brand(s), mode ${mode}, up to "${plan.stopAfter}", ${parallel} at a time.`);
  console.log(`Results: ${dir}`);
  let next = 0;
  const worker = async () => {
    while (next < brands.length) {
      const i = next++;
      const item = run.items[i];
      item.status = 'running'; item.startedAt = new Date().toISOString();
      console.log(`→ ${brands[i].name}`);
      await runOne(brands[i], plan, item, save);
      console.log(`${item.status === 'done' ? '✓' : '✗'} ${brands[i].name}${item.error ? ' — ' + item.error : ''}`);
    }
  };
  await Promise.all(Array.from({length: Math.min(parallel, brands.length)}, worker));
  run.finishedAt = new Date().toISOString();
  await save();
  await writing;
  await buildReport(dir);
  return dir;
}

// ---------- report ----------

async function entryDetails(id) {
  if (!id) return null;
  const e = await api('GET', `/api/history/${id}`).catch(() => null);
  if (!e) return null;
  const log = Array.isArray(e.log) ? e.log : [];
  return {
    id: e.id, status: e.status, model: e.model, effort: e.effort, durationMs: e.durationMs, cost: e.cost,
    output: e.output,
    problems: log.filter(l => l.level === 'error' || l.level === 'warn').map(l => `[${l.level}] ${l.msg}`).slice(-12),
  };
}

function scenarioText(sc, lang) {
  if (!sc) return '';
  const line = id => {
    const l = sc.lines?.[id];
    if (!l) return id;
    const text = l.text?.[lang] ?? Object.values(l.text || {})[0] ?? '';
    return `${l.role}: ${text}`;
  };
  const scenes = (sc.scenes || []).map((s, i) =>
    `Scene ${i + 1}${s.beat ? ' · ' + s.beat : ''}${s.duration ? ' · ' + s.duration + 's' : ''}\n  ${s.story || ''}\n  ${(s.lines || []).map(line).join('\n  ')}`);
  return [`Theme: ${sc.theme || ''}`, `Idea: ${sc.idea || ''}`, ...scenes, sc.notes ? `Notes: ${sc.notes}` : ''].filter(Boolean).join('\n');
}

export async function buildReport(dir) {
  const run = JSON.parse(await fs.readFile(path.join(dir, 'run.json'), 'utf8'));
  const status = await api('GET', '/api/status').catch(() => ({}));
  const formats = Object.fromEntries((status.formats || []).map(f => [f.id, f]));
  const preview = status.previewURL || 'http://127.0.0.1:4318';
  const lang = run.plan?.setup?.languages?.[0] || 'en';

  const rows = [];
  for (const item of run.items) {
    const row = {...item};
    if (item.campaignId) {
      const c = await api('GET', `/api/campaigns/${item.campaignId}`).catch(err => ({error: err.message}));
      if (!c.error) {
        row.cost = c.cost;
        row.campaignName = c.name;
        row.chosenIndex = c.steps?.styles?.chosenIndex ?? null;
        for (const s of STEPS) row[s] = await entryDetails(c.steps?.[s]?.entryId || c.entries?.[s]?.id);
      }
    }
    rows.push(row);
  }
  await fs.writeFile(path.join(dir, 'details.json'), JSON.stringify(rows, null, 2));

  // Plain-text summary for the lab chat (and for Dima).
  const md = [`# ${run.batch}${run.demo ? ' (demo)' : ''}`, '', run.about, '',
    `Started ${run.startedAt} · finished ${run.finishedAt || '—'} · up to "${run.plan.stopAfter}" · setup ${JSON.stringify(run.plan.setup)}`, ''];
  for (const r of rows) {
    md.push(`## ${r.brandName} — ${r.status}`);
    md.push(`Campaign in Forma: "${r.campaignName || '—'}" (${r.campaignId || 'not created'})`);
    if (r.error) md.push(`Error: ${r.error}`);
    if (r.timings) md.push(`Time: ${Object.entries(r.timings).map(([k, v]) => `${k} ${secs(v)}`).join(', ')}`);
    if (r.cost?.total) md.push(`Estimated cost: $${r.cost.total.toFixed(3)}`);
    if (r.scenario) md.push('', '### Script', '```', scenarioText(r.scenario.output?.scenario, lang), '```');
    if (r.styles) md.push('', '### Visual directions', ...(r.styles.output?.styles || []).map((s, i) =>
      `${i + 1}. ${i === r.chosenIndex ? '[chosen] ' : ''}**${s.name}** — ${s.idea}\n   ${(s.direction || '').replace(/\n+/g, ' ').slice(0, 600)}`));
    if (r.preview?.output?.path) md.push('', `Preview: ${preview}${r.preview.output.path}`);
    if (r.final?.output?.path) md.push(`Final: ${preview}${r.final.output.path}`);
    const probs = STEPS.flatMap(s => (r[s]?.problems || []).map(p => `${s}: ${p}`));
    if (probs.length) md.push('', '### Warnings and errors in the logs', ...probs.map(p => `- ${p}`));
    md.push('');
  }
  await fs.writeFile(path.join(dir, 'summary.md'), md.join('\n'));

  const frame = (p, fmtId) => {
    const f = formats[fmtId] || {w: 1080, h: 1080};
    const scale = 300 / Math.max(f.w, f.h);
    return `<div class="frame" style="width:${Math.round(f.w * scale)}px;height:${Math.round(f.h * scale)}px">
      <iframe loading="lazy" src="${esc(preview + p)}" style="width:${f.w}px;height:${f.h}px;transform:scale(${scale})"></iframe></div>`;
  };
  const card = r => {
    const sc = r.scenario?.output?.scenario;
    const styles = r.styles?.output?.styles || [];
    const probs = STEPS.flatMap(s => (r[s]?.problems || []).map(p => `${s}: ${p}`));
    return `<section class="card ${esc(r.status)}">
  <header><h2>${esc(r.brandName)}</h2><span class="pill">${esc(r.status)}</span></header>
  <p class="meta">In Forma: <b>${esc(r.campaignName || '—')}</b>${r.timings ? ' · ' + Object.entries(r.timings).map(([k, v]) => `${esc(k)} ${secs(v)}`).join(' · ') : ''}${r.cost?.total ? ` · ≈ $${r.cost.total.toFixed(3)}` : ''}</p>
  ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
  ${sc ? `<details open><summary>Script</summary><pre>${esc(scenarioText(sc, lang))}</pre></details>` : ''}
  ${styles.length ? `<div class="styles">${styles.map((s, i) => `<figure class="${i === r.chosenIndex ? 'chosen' : ''}">
      ${s.svg ? `<img alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}">` : ''}
      <figcaption><b>${i + 1}. ${esc(s.name)}</b>${i === r.chosenIndex ? ' ✓' : ''}<br>${esc(s.idea)}</figcaption></figure>`).join('')}</div>` : ''}
  ${r.preview?.output?.path ? `<div class="previews"><div><h3>Preview</h3>${frame(r.preview.output.path, r.preview.output.format)}
      <a href="${esc(preview + r.preview.output.path)}" target="_blank">open</a></div>
      ${r.final?.output?.path ? `<div><h3>Final</h3><a href="${esc(preview + r.final.output.path)}" target="_blank">open all formats</a></div>` : ''}</div>` : ''}
  ${probs.length ? `<details><summary>Log warnings and errors (${probs.length})</summary><ul>${probs.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : ''}
</section>`;
  };
  const done = rows.filter(r => r.status === 'done').length;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lab · ${esc(run.batch)}</title><style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--mute:#6b6a66;--line:#e3e1dc;--ok:#2f7d4f;--bad:#b3261e;--acc:#3355ff}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--ink:#eceae5;--mute:#a09e98;--line:#34332f;--ok:#6cc391;--bad:#ff8a80;--acc:#8fa3ff}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 18px}
.card header{display:flex;gap:10px;align-items:center}.card h2{font-size:19px;margin:0}
.pill{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 9px}
.done .pill{color:var(--ok);border-color:var(--ok)}.error .pill,.blocked .pill{color:var(--bad);border-color:var(--bad)}
.meta{color:var(--mute);font-size:13px;margin:6px 0}.err{color:var(--bad)}
pre{white-space:pre-wrap;background:var(--bg);padding:10px 12px;border-radius:8px;font-size:13px;margin:6px 0}
summary{cursor:pointer;font-weight:600;margin:8px 0}
.styles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:10px 0}
figure{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}figure.chosen{border:2px solid var(--acc)}
figure img{width:100%;max-height:300px;object-fit:contain;display:block;background:#fff}figcaption{padding:8px 10px;font-size:13px}
.previews{display:flex;gap:24px;flex-wrap:wrap;margin-top:8px}.previews h3{font-size:14px;margin:0 0 6px}
.frame{overflow:hidden;border-radius:8px;border:1px solid var(--line);background:#000}
.frame iframe{border:0;transform-origin:0 0;pointer-events:none}a{color:var(--acc)}
</style></head><body><main>
<h1>${esc(run.batch)}${run.demo ? ' · demo' : ''}</h1>
<p class="sub">${esc(run.about)}<br>${done} of ${rows.length} finished · up to “${esc(run.plan.stopAfter)}” · ${esc(run.startedAt.slice(0, 16).replace('T', ' '))}
 · previews need Forma running</p>
${rows.map(card).join('\n')}
</main></body></html>`;
  await fs.writeFile(path.join(dir, 'index.html'), html);
  console.log(`Page: ${path.join(dir, 'index.html')}`);
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opt = args(process.argv.slice(2));
  const job = opt.report ? buildReport(path.resolve(opt.report))
    : opt._[0] ? runBatch(opt._[0], opt)
    : Promise.reject(new Error('Usage: node batch.mjs batches/<name>.json [--demo] [--brands a,b] [--parallel N] [--stop-after scenario|styles|preview|final]\n       node batch.mjs --report <results folder>'));
  job.catch(e => { console.error('Error:', e.message); process.exit(1); });
}
