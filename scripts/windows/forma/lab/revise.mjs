// Forma Lab — send notes and revisions to a campaign through Forma itself,
// so they are saved in the campaign the same way as notes typed in the panel.
//
//   node revise.mjs styles  "<campaign>" all "what should change in all three directions"
//   node revise.mjs styles  "<campaign>" 2   "notes for direction 2 only (optional)"
//   node revise.mjs script  "<campaign>" "notes for a new script"     (approve it again afterwards)
//   node revise.mjs approve "<campaign>"                               approve the current script
//   node revise.mjs choose  "<campaign>" 2                             pick direction 2 and build its preview
//   node revise.mjs preview "<campaign>" "what should change in the preview"
//   node revise.mjs final   "<campaign>" "what should change in the final"
//   node revise.mjs show    "<campaign>"                               short state of the campaign
//   node revise.mjs mark    "<campaign>" good|maybe|bad "short reason" verdict, shown in the campaign name in Forma
//   node revise.mjs continue "<campaign>" [--to styles|preview|final] [--choose 2]
//                                         take a good idea further: approve script, directions, preview…
//
// <campaign> is the campaign id or any part of its name (e.g. "LAB quick · Lumo").
import {api, findCampaign} from './api.mjs';

const [cmd, query, ...rest] = process.argv.slice(2);
const usage = () => {
  console.log('Usage: node revise.mjs styles|script|approve|choose|preview|final|show|mark|continue "<campaign>" [...]');
  process.exit(1);
};

function state(c) {
  const s = c.steps || {};
  return {
    id: c.id, name: c.name,
    script: s.scenario?.entryId ? (s.scenario.approvedAt ? 'approved' : 'not approved') + (s.scenario.stale ? ', stale' : '') : 'none',
    directions: s.styles?.entryId ? `chosen ${s.styles.chosenIndex == null ? '—' : s.styles.chosenIndex + 1}` : 'none',
    preview: s.preview?.entryId ? (s.preview.approvedAt ? 'approved' : 'built') + (s.preview.stale ? ', stale' : '') : 'none',
    final: s.final?.entryId ? 'built' + (s.final.stale ? ', stale' : '') : 'none',
    cost: c.cost?.total ? `$${c.cost.total.toFixed(3)}` : '$0',
  };
}

async function main() {
  if (!cmd || !query) usage();
  const c = await findCampaign(query);
  const id = c.id;
  console.log(`Campaign: ${c.name} (${id})`);
  let r;
  switch (cmd) {
    case 'show':
      break;
    case 'styles': {
      const [which, ...words] = rest;
      const feedback = words.join(' ').trim();
      const revise = which === 'all' ? 'all' : Number(which) - 1;
      if (revise !== 'all' && ![0, 1, 2].includes(revise)) throw new Error('Say "all" or a direction number 1–3.');
      r = await api('POST', `/api/campaigns/${id}/styles`, {revise, feedback});
      (r.styles || []).forEach((s, i) => console.log(`${i + 1}. ${s.name} — ${s.idea}`));
      break;
    }
    case 'script': {
      r = await api('POST', `/api/campaigns/${id}/scenario`, {notes: rest.join(' ')});
      const needs = r.campaign?.steps?.scenario?.needs || [];
      if (needs.includes('translation')) await api('POST', `/api/campaigns/${id}/translate`, {});
      if (needs.includes('cuts')) await api('POST', `/api/campaigns/${id}/cuts`, {});
      console.log(`Theme: ${r.scenario?.theme}\nIdea: ${r.scenario?.idea}`);
      if (r.validation?.errors?.length) console.log('Validation errors:', r.validation.errors);
      break;
    }
    case 'approve':
      await api('POST', `/api/campaigns/${id}/approve`, {step: 'scenario'});
      break;
    case 'choose': {
      const index = Number(rest[0]) - 1;
      await api('POST', `/api/campaigns/${id}/styles/choose`, {index});
      r = await api('POST', `/api/campaigns/${id}/preview`, {});
      console.log(`Preview: ${r.url}`);
      break;
    }
    case 'preview':
    case 'final': {
      const entry = c.steps?.[cmd]?.entryId;
      if (!entry) throw new Error(`This campaign has no ${cmd} yet.`);
      r = await api('POST', `/api/history/${entry}/revise`, {message: rest.join(' ')});
      console.log(r.url ? `New version: ${r.url}` : JSON.stringify(r).slice(0, 500));
      break;
    }
    case 'mark': {
      const [verdict, ...words] = rest;
      const sign = {good: '✓', maybe: '~', bad: '✗'}[verdict];
      if (!sign) throw new Error('Verdict must be good, maybe or bad.');
      const base = c.name.split(' — ')[0];
      const reason = words.join(' ').trim();
      const name = `${base} — ${sign}${reason ? ' ' + reason : ''}`.slice(0, 160);
      await api('PATCH', `/api/campaigns/${id}`, {name});
      console.log(`Renamed: ${name}`);
      break;
    }
    case 'continue': {
      const flag = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
      const to = flag('--to') || 'preview';
      if (!['styles', 'preview', 'final'].includes(to)) throw new Error('--to must be styles, preview or final.');
      const choose = flag('--choose');
      let cur = c;
      const sc = cur.steps.scenario;
      if (!sc.entryId) throw new Error('This campaign has no script yet.');
      if (sc.needs?.includes('translation')) await api('POST', `/api/campaigns/${id}/translate`, {});
      if (sc.needs?.includes('cuts')) await api('POST', `/api/campaigns/${id}/cuts`, {});
      if (!sc.approvedAt || sc.stale) { console.log('Approving the script…'); cur = await api('POST', `/api/campaigns/${id}/approve`, {step: 'scenario'}); }
      if (!cur.steps.styles?.entryId) { console.log('Three visual directions…'); cur = (await api('POST', `/api/campaigns/${id}/styles`, {})).campaign; }
      if (to === 'styles') break;
      const want = choose ? Number(choose) - 1 : cur.steps.styles.chosenIndex ?? 0;
      let rebuilt = false;
      if (cur.steps.styles.chosenIndex !== want) {
        console.log(`Direction ${want + 1}…`);
        cur = await api('POST', `/api/campaigns/${id}/styles/choose`, {index: want});
      }
      if (!cur.steps.preview?.entryId || cur.steps.preview.stale) {
        console.log('Preview…');
        r = await api('POST', `/api/campaigns/${id}/preview`, {});
        console.log(`Preview: ${r.url}`);
        rebuilt = true;
      }
      if (to === 'preview') break;
      cur = await api('GET', `/api/campaigns/${id}`);
      if (!cur.steps.preview.approvedAt || rebuilt) await api('POST', `/api/campaigns/${id}/approve`, {step: 'preview'});
      console.log('Final (all formats)…');
      r = await api('POST', `/api/campaigns/${id}/final`, {});
      console.log(`Final: ${r.url}`);
      break;
    }
    default:
      usage();
  }
  console.log(state(await api('GET', `/api/campaigns/${id}`)));
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
