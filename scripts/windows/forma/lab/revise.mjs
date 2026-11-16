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
//
// <campaign> is the campaign id or any part of its name (e.g. "LAB quick · Lumo").
import {api, findCampaign} from './api.mjs';

const [cmd, query, ...rest] = process.argv.slice(2);
const usage = () => {
  console.log('Usage: node revise.mjs styles|script|approve|choose|preview|final|show "<campaign>" [...]');
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
    default:
      usage();
  }
  console.log(state(await api('GET', `/api/campaigns/${id}`)));
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
