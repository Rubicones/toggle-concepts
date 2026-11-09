import {planningObject, readPlanningDirections, type PlanningJob, type PlanningDirection} from '../director/planning';
import type {ApprovedLocalization} from '../director/inputs';

export const SCENARIO_SELECTION_MARKER = 'Scenario selection protocol: 1.';
export const usesScenarioSelection = (instructions?: string) => instructions?.includes(SCENARIO_SELECTION_MARKER) === true;
export type ScenarioSelection = {scriptJobId: string; scriptHash: string; scenarioId: string};
export type ScenarioSelectionView = {required: boolean; ready: boolean; reviewed: boolean; selection: ScenarioSelection | null};

export function selectedScenario(script: PlanningJob, selection: ScenarioSelection) {
  if (script.id !== selection.scriptJobId || script.output_hash !== selection.scriptHash || script.state !== 'succeeded') throw new Error('STALE_SCENARIO_SELECTION');
  const found = readPlanningDirections(script.output).filter(d => d.id === selection.scenarioId);
  if (found.length !== 1) throw new Error('SCENARIO_SELECTION_REQUIRED');
  return found[0];
}

/** Keep full evidence in the admitted snapshot; send only the chosen narrative to downstream models. */
export function scenarioTransport<T extends {upstream?: {jobId: string; sha256: string; output: string}[]; scenarioSelection?: ScenarioSelection}>(snapshot: T): T {
  const selection = snapshot.scenarioSelection;
  if (!selection) return snapshot;
  let found = false;
  const upstream = snapshot.upstream?.map(ref => {
    if (ref.jobId !== selection.scriptJobId) return ref;
    const direction = selectedScenario({id: ref.jobId, output_hash: ref.sha256, output: ref.output, job_key: 'script', state: 'succeeded'}, selection);
    found = true;
    return {...ref, output: JSON.stringify({role: 'script', deliverable: {threeDirections: [direction.value]}, scenarioSelection: selection})};
  });
  if (!found) throw new Error('STALE_SCENARIO_SELECTION');
  return {...snapshot, upstream};
}

export function bindScenarioOutput(text: string, role: string, selection?: ScenarioSelection, narrativeOnly = false) {
  const output = JSON.parse(text);
  if (output.status === 'blocked') return text;
  if (role === 'script' && narrativeOnly) {
    const directions = readPlanningDirections(output);
    if (directions.length !== 3 || new Set(directions.map(d => d.id)).size !== 3 || directions.some(d=>!['concept-1','concept-2','concept-3'].includes(d.id))) throw new Error('THREE_DIRECTIONS_REQUIRED');
    for (const d of directions) {
      if ('assetNeeds' in d.value) throw new Error('SCENARIO_VISUALS_NOT_ALLOWED');
      for (const scene of d.storyboard) {
        const s = planningObject(scene);
        if (['visualNotes', 'motionNotes', 'composition', 'lighting', 'camera'].some(k => k in s)) throw new Error('SCENARIO_VISUALS_NOT_ALLOWED');
        if (typeof s.beat !== 'string' || !s.beat.trim()) throw new Error('SCENARIO_BEAT_REQUIRED');
      }
    }
  }
  if (!selection || !['visual-direction', 'localization'].includes(role)) return text;
  if (role === 'visual-direction') {
    const treatments = output.deliverable?.treatments;
    if (!Array.isArray(treatments) || treatments.length !== 3 || new Set(treatments.map(t => t.conceptId)).size !== 3 || treatments.some(t => !['concept-1', 'concept-2', 'concept-3'].includes(t.conceptId) || t.scenarioId !== selection.scenarioId)) throw new Error('SCENARIO_TREATMENT_MISMATCH');
  }
  output.deliverable.scenarioSelection = selection;
  return JSON.stringify(output);
}

/** Three presentation identities, all carrying the exact same selected story, hooks, proof and timings. */
export function draftPlanningDirections(script: PlanningJob, visual: PlanningJob): PlanningDirection[] {
  const raw = typeof visual.output === 'string' ? JSON.parse(visual.output) : visual.output;
  const deliverable = planningObject(planningObject(raw).deliverable);
  if (!deliverable.scenarioSelection) {
    const directions=readPlanningDirections(script.output);
    if(directions.some(d=>d.storyboard.some(s=>typeof planningObject(s).beat==='string')))throw new Error('SCENARIO_SELECTION_REQUIRED');
    return directions;
  }
  const selection = deliverable.scenarioSelection as ScenarioSelection;
  const source = selectedScenario(script, selection);
  bindScenarioOutput(JSON.stringify(raw), 'visual-direction', selection);
  return (deliverable.treatments as Record<string, unknown>[]).map(t => {
    const id = String(t.conceptId), slot = Number(id.slice(-1));
    return {...source, id, aliases: [id, String(slot), `direction-${slot}`], value: {...source.value, id, conceptId: id, conceptSlot: slot, sourceScenarioId: source.id, name: t.name, scenarioName: source.value.name}};
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** A shared narrative can share translations only with an exact, application-recorded selection binding. */
export function selectedScenarioLocalization(localization: PlanningJob, visual: PlanningJob, rows: ApprovedLocalization[]) {
  const data = (job: PlanningJob) => planningObject(planningObject(typeof job.output === 'string' ? JSON.parse(job.output) : job.output).deliverable);
  const selection = data(visual).scenarioSelection as ScenarioSelection | undefined;
  if (!selection) return null;
  const bound = data(localization).scenarioSelection as ScenarioSelection | undefined;
  if (!bound || bound.scriptJobId !== selection.scriptJobId || bound.scriptHash !== selection.scriptHash || bound.scenarioId !== selection.scenarioId) throw new Error('STALE_SCENARIO_SELECTION');
  return rows;
}
