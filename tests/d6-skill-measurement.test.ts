// D6 (docs/plans/2026-11-13-skills-critic-image-owner.md): skill measurement. Recorded critic answers only; no model, no
// database (a fake service client).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settleHeroReview} from '../packages/director/critic-review';
import {skillMeasures,measureLine,checkLine,ablationLabel,withoutSkill,criticSummary,criticLine,type CheckRow} from '../packages/agents/skill-measure';
import {buildStageSkills,stageTokens,SKILL_STAGES} from '../packages/agents/stage-skills';
import {readSkills} from '../packages/agents/skill-files';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {recordCheckAnswers} from '../apps/local-runner/director/critic-checks';

const answer=(checks:{s:string;n:number;ok:boolean}[],rulings:{note:string;ruling:string}[]=[])=>JSON.stringify({rulings,checks:checks.map(c=>({...c,e:'seen'})),notes:[],accepted:false,summary:'s'});
/** Recorded hero reviews of three runs, settled as the worker settles them, as the rows the runner stores. */
function rows(){
 const out:CheckRow[]=[];const add=(run:string,round:number,text:string,stop?:string|null)=>{const s=settleHeroReview(text,round,[],0)!;for(const a of s.round.answers)out.push({run_id:run,direction_id:'d1',stage:'hero',round,skill_id:a.skill,check_no:a.n,ok:a.ok,stop:stop??s.result.stop??null});};
 add('run-1',1,answer([{s:'reading-order',n:1,ok:false},{s:'reading-order',n:2,ok:true}]));add('run-1',2,answer([{s:'reading-order',n:1,ok:true},{s:'reading-order',n:2,ok:true}]),'all-pass');
 add('run-2',1,answer([{s:'reading-order',n:1,ok:false},{s:'reading-order',n:2,ok:false}]));add('run-2',2,answer([{s:'reading-order',n:1,ok:false},{s:'reading-order',n:2,ok:true}]),'rounds');
 add('run-3',1,answer([{s:'reading-order',n:1,ok:true},{s:'reading-order',n:2,ok:true},{s:'type-as-voice',n:1,ok:true}]),'all-pass');
 return out;
}

test('D6: recorded critic answers give each skill plain numbers; with no answers, "not measured yet"', ()=>{
 const m=skillMeasures(rows()),reading=m.find(x=>x.skill==='reading-order')!;
 assert.equal(reading.runs,3);assert.deepEqual(reading.checks.map(c=>[c.check,c.firstRoundFails,c.firstRoundRuns,c.failed,c.fixedLater]),[[1,2,3,2,1],[2,1,3,1,1]]);
 assert.equal(measureLine(reading),'used in 3 runs; fails first time in 50% of runs; fixed after review in 67%');
 assert.equal(checkLine(reading.checks[0]),'check 1: fails first time in 67% of 3 runs; fixed after review in 50%');
 assert.equal(measureLine(m.find(x=>x.skill==='type-as-voice')),'used in 1 run; fails first time in 0% of runs; no failed check to fix yet');
 assert.equal(measureLine(undefined),'not measured yet');
});

test('D6: the ablation removes exactly one skill from the frozen stages and budgets, and nothing else', ()=>{
 const files=readSkills(),all=buildStageSkills(files,[]),less=buildStageSkills(withoutSkill(files,'reading-order'),[]);
 for(const stage of SKILL_STAGES){
  assert.deepEqual(less.stages[stage]??[],(all.stages[stage]??[]).filter(s=>s.id!=='reading-order'),stage);
  assert.equal(stageTokens(all.stages[stage])-stageTokens(less.stages[stage]),stageTokens((all.stages[stage]??[]).filter(s=>s.id==='reading-order')),`${stage}: the budget drops by that skill only`);
 }
 assert.equal(withoutSkill(files,undefined),files,'no flag: the same skills');
 const ctx=(stageSkills:typeof all,without?:string)=>buildRunContext({briefText:'{}',brandPack:'BRAND',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},stageSkills,...(without?{withoutSkill:without}:{})});
 const a=ctx(all),b=ctx(less,'reading-order');assert.equal(b.withoutSkill,'reading-order');assert.equal(a.sha256,b.sha256,'the shared prefix is the same');
 const strip=({stageSkills:_s,withoutSkill:_w,...rest}:typeof a)=>{void _s;void _w;return rest;};assert.deepEqual(strip(b),strip(a),'only the skills by stage and the record differ');
 const bench=readFileSync('scripts/bench/pipeline-bench.ts','utf8');assert.match(bench,/arg\('without-skill',''\)/);assert.equal(bench.match(/withoutSkill\(readSkills\(\),without\)/g)?.length,2,'designer and critic');
 assert.match(readFileSync('scripts/bench/ablation-pair.ts','utf8'),/blindOrder\(basename\(x\),basename\(y\)\)/);assert.match(readFileSync('scripts/bench/README.md','utf8'),/--without-skill=<id>/);
 assert.match(readFileSync('apps/local-runner/local-claude/skills.ts','utf8'),/STUDIO_WITHOUT_SKILL/);
});

test('D6: storing check answers never blocks a run: a missing table warns once and returns', async()=>{
 const upserts:unknown[]=[],make=(error:{message:string}|null)=>({from:(t:string)=>{const c:Record<string,unknown>={};c.select=()=>c;c.eq=()=>c;c.maybeSingle=async()=>({data:{tenant_id:'t'},error:null});c.upsert=async(v:unknown)=>{upserts.push([t,v]);return {error};};return c;}}) as never;
 const answers=[{skill:'reading-order',n:1,ok:false,evidence:'The price leads.'},{skill:'Bad Id',n:1,ok:true,evidence:''}];
 assert.equal(await recordCheckAnswers(make(null),{runId:'r',directionId:'d',stage:'hero',round:1,answers,stop:null}),true);
 assert.deepEqual((upserts[0] as [string,{skill_id:string}[]])[1].map(r=>r.skill_id),['reading-order'],'only valid rows');
 const logged:string[]=[],original=console.error;console.error=(m:string)=>{logged.push(m);};
 try{assert.equal(await recordCheckAnswers(make({message:'relation does not exist'}),{runId:'r',directionId:'d',stage:'hero',round:1,answers}),false);await recordCheckAnswers(make({message:'again'}),{runId:'r',directionId:'d',stage:'hero',round:2,answers});}
 finally{console.error=original;}
 assert.equal(logged.length,1,'one warning');assert.match(logged[0],/apply migration 20261113000700_skill_measurement\.sql/);
});

test('D6: "no measured effect" only after blind pairs the owner could not tell apart; D7 reads critic rounds and stops', ()=>{
 assert.equal(ablationLabel([]),null);assert.equal(ablationLabel([{noticed:false}]),'removal noticed in 0 of 1 blind pair');
 assert.equal(ablationLabel([{noticed:false},{noticed:false}]),'no measured effect');assert.equal(ablationLabel([{noticed:false},{noticed:true},{noticed:false}]),'removal noticed in 1 of 3 blind pairs');
 const c=criticSummary(rows());assert.deepEqual(c,{heroRounds:5,endRounds:0,stops:{'all-pass':2,rounds:1}});
 assert.equal(criticLine(c),'Critic rounds: 5 hero, 0 end of draft; stops: all checks passed 2, rounds used 1.');
 assert.match(criticLine(criticSummary([])),/not measured/);
 assert.match(readFileSync('supabase/migrations/20261113000700_skill_measurement.sql','utf8'),/revoke all on public\.studio_critic_checks,public\.studio_skill_ablations from public,anon,authenticated/);
});
