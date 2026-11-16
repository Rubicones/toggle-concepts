// Exports one Forma campaign for a report: every step (brief, script, styles, preview, final, revisions) with its full
// run log, and the campaign's files (materials, generated pictures and videos, creative HTML), into one zip in
// C:\toggle\exports. Read-only: nothing in the shared base changes. Keys and settings are never exported.
// Run from the Forma folder: node --env-file-if-exists=.env export-campaign.mjs [part of the campaign name | campaign id]
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const repo = process.cwd(), outRoot = process.env.EXPORT_DIR || '/mnt/c/toggle/exports';
const {store} = await import(path.join(repo, 'store/index.mjs'));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(repo, 'data'));
await store.history.open(dataDir);
const wanted = process.argv.slice(2).join(' ').trim().toLowerCase();

async function all(filter) {
  const out = []; let before;
  for (let i = 0; i < 50; i++) { const page = await store.history.list({...filter, limit: 200, ...(before ? {before} : {})}); out.push(...page.items); if (!page.next) break; before = page.next; }
  return out;
}
const campaigns = await all({type: 'campaign'});
if (!campaigns.length) { console.log('Кампаний нет.'); process.exit(1); }
const pick = wanted ? campaigns.find(c => c.id === wanted) || campaigns.find(c => String(c.name || '').toLowerCase().includes(wanted)) : campaigns[0];
if (!pick) { console.log(`Кампания «${wanted}» не найдена. Последние: ${campaigns.slice(0, 8).map(c => c.name).join(' · ')}`); process.exit(1); }

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const safe = String(pick.name || 'campaign').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 40);
const dir = path.join(outRoot, `${safe}-${stamp}`);
await fs.mkdir(path.join(dir, 'steps'), {recursive: true});
console.log(`Кампания: ${pick.name} (${pick.id})`);

const campaign = await store.history.get(pick.id, {withLog: true});
await fs.writeFile(path.join(dir, 'campaign.json'), JSON.stringify(campaign, null, 1));
const steps = await all({campaign: pick.id});
const projects = new Set([campaign.project].filter(Boolean));
for (const s of steps) {
  if (s.id === pick.id) continue;
  const full = await store.history.get(s.id, {withLog: true});
  if (full?.project) projects.add(full.project);
  await fs.writeFile(path.join(dir, 'steps', `${(full.createdAt || '').slice(0, 19).replace(/[:T]/g, '-')}-${full.type || 'step'}-${full.id.slice(0, 8)}.json`), JSON.stringify(full, null, 1));
}
console.log(`Шагов: ${steps.length}. Проекты с файлами: ${projects.size}.`);

const files = path.join(dir, 'files');
for (const p of projects) {
  if (store.driver === 'file') await fs.cp(path.join(dataDir, p), path.join(files, p), {recursive: true}).catch(() => {});
  else { const r = await store.sync.down(p, {dataDir: files}); console.log(`Файлы проекта ${p.slice(0, 8)}: ${r.downloaded + r.skipped}`); }
}
await fs.writeFile(path.join(dir, 'README.txt'), [
  `Экспорт кампании Forma «${pick.name}» (${pick.id}), ${new Date().toISOString()}.`,
  'campaign.json — кампания: бриф, варианты стилей, шаги, стоимость, и её журнал.',
  'steps/ — каждый шаг (сценарий, стили, превью, финал, правки) с полным журналом сборки: промпты, ответы модели, запросы картинок и видео, время, стоимость.',
  'files/ — файлы кампании: материалы бренда, сгенерированные картинки и видео, HTML креативов.',
  'Ключи и настройки не экспортируются.',
].join('\n') + '\n');
try { execFileSync('zip', ['-qr', `${dir}.zip`, path.basename(dir)], {cwd: outRoot}); console.log(`Готово: ${dir}.zip`); }
catch { console.log(`Готово (без архива): ${dir}`); }
process.exit(0);
