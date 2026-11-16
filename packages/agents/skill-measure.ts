// D6 (docs/plans/2026-11-13-skills-critic-image-owner.md): skill measurement. The critic's check answers (critic@2), stored
// per run, direction, stage, skill, check and round, become plain numbers per skill; the owner's blind-pair verdicts of
// a skill's removal give the label "no measured effect" (the owner decides whether to retire it). Pure.
import type {SkillFile} from './skill-files';

export type CheckRow={run_id:string;direction_id:string;stage:string;round:number;skill_id:string;check_no:number;ok:boolean;stop?:string|null};
export type CheckMeasure={check:number;firstRoundRuns:number;firstRoundFails:number;failed:number;fixedLater:number};
export type SkillMeasure={skill:string;runs:number;checks:CheckMeasure[];firstFailRate:number|null;fixedRate:number|null};

/** Per skill: the runs it was answered in; per check, how often it failed in a frame's first round, and how often a
 * failed check passed in a later round of the same frame and stage. */
export function skillMeasures(rows:CheckRow[]):SkillMeasure[]{
 const bySkill=new Map<string,CheckRow[]>();for(const r of rows)bySkill.set(r.skill_id,[...(bySkill.get(r.skill_id)??[]),r]);
 return [...bySkill.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([skill,list])=>{
  const checks=[...new Set(list.map(r=>r.check_no))].sort((a,b)=>a-b).map(check=>{
   const mine=list.filter(r=>r.check_no===check),frames=new Map<string,CheckRow[]>();
   for(const r of mine){const k=`${r.run_id}|${r.direction_id}|${r.stage}`;frames.set(k,[...(frames.get(k)??[]),r]);}
   let firstRoundRuns=0,firstRoundFails=0,failed=0,fixedLater=0;const runsFirst=new Map<string,boolean>();
   for(const [k,f] of frames){const sorted=[...f].sort((a,b)=>a.round-b.round),first=sorted[0];
    if(first.round===1){const run=k.split('|')[0];runsFirst.set(run,(runsFirst.get(run)??false)||!first.ok);}
    const failAt=sorted.findIndex(r=>!r.ok);if(failAt>=0){failed++;if(sorted.slice(failAt+1).some(r=>r.ok))fixedLater++;}}
   for(const fail of runsFirst.values()){firstRoundRuns++;if(fail)firstRoundFails++;}
   return {check,firstRoundRuns,firstRoundFails,failed,fixedLater};
  });
  const firstRuns=checks.reduce((n,c)=>n+c.firstRoundRuns,0),firstFails=checks.reduce((n,c)=>n+c.firstRoundFails,0),failed=checks.reduce((n,c)=>n+c.failed,0),fixed=checks.reduce((n,c)=>n+c.fixedLater,0);
  return {skill,runs:new Set(list.map(r=>r.run_id)).size,checks,firstFailRate:firstRuns?firstFails/firstRuns:null,fixedRate:failed?fixed/failed:null};
 });
}
const pct=(x:number)=>`${Math.round(x*100)}%`;
/** The card line: "fails first time in 40% of runs; fixed after review in 75%", or "not measured yet". */
export function measureLine(m:SkillMeasure|undefined){
 if(!m||!m.runs)return 'not measured yet';
 return [`used in ${m.runs} run${m.runs===1?'':'s'}`,m.firstFailRate!==null?`fails first time in ${pct(m.firstFailRate)} of runs`:'',m.fixedRate!==null?`fixed after review in ${pct(m.fixedRate)}`:'no failed check to fix yet'].filter(Boolean).join('; ');
}
export const checkLine=(c:CheckMeasure)=>`check ${c.check}: fails first time in ${c.firstRoundRuns?pct(c.firstRoundFails/c.firstRoundRuns):'–'} of ${c.firstRoundRuns} run${c.firstRoundRuns===1?'':'s'}; fixed after review in ${c.failed?pct(c.fixedLater/c.failed):'–'}`;

/** Blind pairs of a run with and without the skill: when the owner noticed no difference in at least two pairs (and
 * never noticed one), the skill shows "no measured effect". Nothing happens automatically. */
export function ablationLabel(verdicts:{noticed:boolean}[]){
 if(!verdicts.length)return null;
 const noticed=verdicts.filter(v=>v.noticed).length;
 return noticed===0&&verdicts.length>=2?'no measured effect':`removal noticed in ${noticed} of ${verdicts.length} blind pair${verdicts.length===1?'':'s'}`;
}

/** The ablation: the same skills without exactly one (its texts leave every stage; nothing else changes). */
export function withoutSkill<T extends Pick<SkillFile,'id'>>(skills:T[],id:string|undefined):T[]{return id?skills.filter(s=>s.id!==id):skills;}

/** D7: critic rounds and stop reasons of a run, from its stored check answers (critic@2). */
export function criticSummary(rows:CheckRow[]){
 const rounds=new Map<string,{stage:string;stop?:string|null}>();
 for(const r of rows){const k=`${r.run_id}|${r.direction_id}|${r.stage}|${r.round}`,prior=rounds.get(k);rounds.set(k,{stage:r.stage,stop:prior?.stop??r.stop??null});}
 const list=[...rounds.values()],stops:Record<string,number>={};for(const r of list)if(r.stop)stops[r.stop]=(stops[r.stop]??0)+1;
 return {heroRounds:list.filter(r=>r.stage==='hero').length,endRounds:list.filter(r=>r.stage==='extension').length,stops};
}
export const criticLine=(c:ReturnType<typeof criticSummary>)=>!c.heroRounds&&!c.endRounds?'Critic rounds: not measured (runs before critic@2 or without the migration).':`Critic rounds: ${c.heroRounds} hero, ${c.endRounds} end of draft${Object.keys(c.stops).length?`; stops: ${Object.entries(c.stops).map(([k,n])=>`${({'all-pass':'all checks passed','no-progress':'no further progress',rounds:'rounds used'} as Record<string,string>)[k]??k} ${n}`).join(', ')}`:''}.`;
