import {briefDraftSchema, briefSuggestionFields} from '../contracts/brief';
type BriefField = typeof briefSuggestionFields[number];
export type BriefEvidence = {kind: 'finding' | 'brief'; id: string; locator: string; evidence: string};
export type BriefCandidate = {field: BriefField; value: string; sources: BriefEvidence[]};
export type SubmittedFinding = {findingId: string; field: string; value: string; decision: string; evidence: string; locator: string};
export type SavedBriefEvidence = {id: string; field: string; value: string; locator: string; evidence: string};
const fields = new Set<string>(briefSuggestionFields);
const eligible = new Set(['brandName', 'brandDescription', 'productIdentity', 'copyRules', 'fontLicenses', 'prohibitions', 'localization']);
const aliases: Record<string, BriefField> = {product: 'product', objective: 'objective', audience: 'audience', targetaudience: 'audience', markets: 'markets', targetmarkets: 'markets', offer: 'offer', cta: 'cta', calltoaction: 'cta', destination: 'destination', immutables: 'immutables', synthesis: 'synthesis', rightsnotes: 'rightsNotes', variationnotes: 'variationNotes'};

/** No model call: use saved evidence, never approve rights, scope, prices or claims. */
export function brandbookBriefCandidates(findings: SubmittedFinding[], briefEvidence: SavedBriefEvidence[]) {
  const candidates: BriefCandidate[] = [], conflicts: string[] = [];
  const add = (field: BriefField, value: string, source: BriefEvidence) => {if (value.trim()) candidates.push({field, value: value.trim(), sources: [source]});};
  for (const row of briefEvidence) if (fields.has(row.field)) add(row.field as BriefField, row.value, {kind: 'brief', id: row.id, locator: row.locator, evidence: row.evidence});
  const kept = findings.filter(f => f.decision !== 'reject');
  for (const row of kept) {
    if (!eligible.has(row.field)) continue;
    const source: BriefEvidence = {kind: 'finding', id: row.findingId, locator: row.locator, evidence: row.evidence};
    // Also recover explicit questionnaire keys from earlier structured findings.
    let value: unknown; try {value = JSON.parse(row.value);} catch {continue;}
    const queue = [value];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (Array.isArray(item)) {for (const child of item) queue.push(child); continue;}
      if (!item || typeof item !== 'object') continue;
      for (const [key, entry] of Object.entries(item)) {
        const field = aliases[key.toLowerCase().replace(/[^a-z]/g, '')];
        if (field && typeof entry === 'string') add(field, entry, source);
        else if (entry && typeof entry === 'object') queue.push(entry);
      }
    }
  }
  const fallback = (target: BriefField, rows: SubmittedFinding[]) => {
    if (candidates.some(c => c.field === target) || !rows.length) return;
    candidates.push({field: target, value: [...new Set(rows.map(r => r.value.trim()))].join('\n\n'), sources: rows.map(r => ({kind: 'finding', id: r.findingId, locator: r.locator, evidence: r.evidence}))});
  };
  const names = kept.filter(r => r.field === 'brandName'), chosenNames = names.filter(r => r.decision === 'keep');
  const descriptions = kept.filter(r => r.field === 'brandDescription');
  fallback('product', descriptions.length ? descriptions : chosenNames.length ? chosenNames : new Set(names.map(r => r.value.trim())).size === 1 ? names : []);
  fallback('immutables', kept.filter(r => r.field === 'productIdentity'));
  const suggestions: BriefCandidate[] = [];
  for (const field of briefSuggestionFields) {
    const matching = candidates.filter(c => c.field === field);
    if (!matching.length) continue;
    const values = [...new Set(matching.map(c => c.value))];
    // Disagreeing answers need AD review; never silently choose a candidate.
    if (values.length !== 1) {conflicts.push(field); continue;}
    const max = briefDraftSchema.shape[field].maxLength!;
    const value = values[0].length > max ? values[0].slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '') + '…' : values[0];
    suggestions.push({field, value, sources: matching.flatMap(c => c.sources)});
  }
  return {suggestions, conflicts};
}
