import 'server-only';
import {emptyBrief} from '@/packages/contracts/brief';
import {brandbookBriefCandidates, type SubmittedFinding, type SavedBriefEvidence} from '@/packages/brand/brief-prefill';
import {checked, studioContext} from './studio';
import {ApiError} from './api';
import {schemaMissing} from './brief';

export async function prefillBrandbookBrief(campaign: {id: string; goal: string}, submission: {id: string; created_at: string}) {
  const {admin, tenant, actorId} = await studioContext();
  const findings: SubmittedFinding[] = [], brief: SavedBriefEvidence[] = [];
  for (let offset = 0;; offset += 1000) {
    const rows = checked(await admin.from('studio_brandbook_submission_items').select('payload').eq('submission_id', submission.id).order('source_seq').range(offset, offset + 999)) ?? [];
    findings.push(...rows.map(row => row.payload as SubmittedFinding));
    if (rows.length < 1000) break;
  }
  for (let offset = 0;; offset += 1000) {
    const rows = checked(await admin.from('studio_brand_brief_findings').select('id,field,value,locator,evidence').eq('tenant_id', tenant).eq('campaign_id', campaign.id).lte('created_at', submission.created_at).order('seq').range(offset, offset + 999)) ?? [];
    brief.push(...rows as SavedBriefEvidence[]);
    if (rows.length < 1000) break;
  }
  const candidates = brandbookBriefCandidates(findings, brief);
  const result = await admin.rpc('studio_apply_brandbook_brief', {target_submission: submission.id, draft_seed: emptyBrief(campaign.goal), suggestions: candidates.suggestions, conflicts: candidates.conflicts, acting_user: actorId});
  if (result.error && schemaMissing(result.error)) throw new ApiError(503, 'BRANDBOOK_UPDATES_REQUIRED', 'Enable Brandbook updates in Settings to fill the brief and analyze individual sources.');
  const value = checked(result) as {status: string; version?: number; fields: Record<string, unknown>; conflicts: string[]};
  return {filled: Object.keys(value.fields), conflicts: value.conflicts, fixed: value.status === 'c1_fixed', version: value.version};
}
