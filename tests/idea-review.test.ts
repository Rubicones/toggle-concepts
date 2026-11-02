import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {ideaReviewPrompt,parseIdeaReview,decideIdeaGate,nextIdeaGate,gateFor,readIdeaReviewState,ideaReviewLines,IDEA_REVIEW_VERSION,type IdeaReviewState,type IdeaGateJob} from '../packages/contracts/idea-review';
import {ideaReviewGates} from '../apps/local-runner/idea-review';

const envelope=(deliverable:unknown)=>JSON.stringify({schemaVersion:'1.0',role:'critic',status:'draft',summary:'s',deliverable,inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:null,requiredInputs:[],checks:[]}});
const long='x'.repeat(5000);
const outputs={strategy:envelope({strategicBrief:long,audienceSituation:'a',threeTerritories:[1,2,3].map(i=>({id:`territory-${i}`,name:`T${i}`,promise:long,creativeIdea:long,visualPremise:long}))}),
 script:envelope({threeDirections:[1,2,3].map(i=>({conceptId:`concept-${i}`,name:`D${i}`,premise:long,hook:'h',timedStoryboard:Array.from({length:8},()=>({copy:long,visualNotes:long}))}))}),
 visual:envelope({treatments:[1,2,3].map(i=>({conceptId:`concept-${i}`,visualIdea:long,makingTechnique:long,composition:long}))})};
const rejected=(note='Two territories share one world.')=>envelope({accepted:false,summary:'Alike.',directions:[],note});
const accepted=envelope({accepted:true,summary:'Strong.',directions:[],note:null});

test('each review judges its own step, fits the step limit and never prescribes a style',()=>{
 const s=ideaReviewPrompt('strategy',outputs),c=ideaReviewPrompt('script',outputs),v=ideaReviewPrompt('asset-plan',outputs);
 for(const p of [s,c,v]){assert.ok(p.length<=15500&&p.length>3000);assert.match(p,/Never prescribe a style, format, layout, technique or example/);assert.doesNotMatch(p,/e\.g\./);}
 assert.match(s,/STRATEGY REVIEW/);assert.ok(s.includes('territory-3'));assert.ok(!s.includes('concept-1'),'strategy is judged before scripts exist');
 assert.match(c,/SCENARIO REVIEW/);assert.ok(c.includes('concept-3')&&c.includes('"scenes"'));assert.ok(!c.includes('makingTechnique'));
 assert.match(v,/VISUAL DIRECTION REVIEW/);assert.ok(v.includes('makingTechnique'));
 assert.ok(ideaReviewPrompt('script',{}).length<3000,'missing outputs still give a valid prompt');
});

test('answers are read leniently; a note only comes with a rejection',()=>{
 assert.equal(parseIdeaReview(rejected())!.note,'Two territories share one world.');
 assert.equal(parseIdeaReview('Here: '+JSON.stringify({accepted:false,summary:'x',directions:[],note:'n'})+' ok')!.note,'n','JSON inside prose');
 assert.equal(parseIdeaReview(envelope({accepted:false,summary:'x',directions:[],revision:{role:'script',note:'old shape'}}))!.note,'old shape');
 assert.equal(parseIdeaReview(envelope({accepted:true,summary:'x',directions:[],note:'ignored'}))!.note,null);
 assert.equal(parseIdeaReview('not json'),null);assert.equal(parseIdeaReview(envelope({summary:'no verdict'})),null);
});

test('steps are reviewed in planning order, each output once',()=>{
 const jobs:IdeaGateJob[]=[{id:'s',job_key:'strategy',state:'succeeded',output_hash:'h1'},{id:'c',job_key:'script',state:'queued'},{id:'v',job_key:'asset-plan',state:'queued'}];
 assert.equal(nextIdeaGate(jobs,[])!.gate.key,'strategy');
 assert.equal(nextIdeaGate(jobs,[{job_id:'s',output_hash:'h1'}]),null,'script has not run yet');
 assert.equal(nextIdeaGate(jobs,[{job_id:'s',output_hash:'other'}])!.gate.key,'strategy','a changed output is reviewed again');
 jobs[1]={id:'c',job_key:'script',state:'succeeded',output_hash:'h2'};jobs[2]={id:'v',job_key:'asset-plan',state:'succeeded',output_hash:'h3'};
 assert.equal(nextIdeaGate(jobs,[{job_id:'s',output_hash:'h1'}])!.gate.key,'script');
 assert.equal(nextIdeaGate(jobs,[{job_id:'s',output_hash:'h1'},{job_id:'c',output_hash:'h2'}])!.gate.key,'asset-plan');
});

test('one paid review and at most one automatic revision per step; every failure passes',()=>{
 const base={reviews:1,revisions:0,requestId:'r',stepId:'x'};
 assert.equal(decideIdeaGate({reviews:0,revisions:0},null).action,'identify');assert.equal(decideIdeaGate({reviews:1,revisions:0},null).action,'pass','an AD-changed output after a review is not reviewed again');
 assert.equal(decideIdeaGate({reviews:1,revisions:0,requestId:'r'},null).action,'send');
 assert.equal(decideIdeaGate(base,{status:'running'}).action,'wait');
 assert.deepEqual([decideIdeaGate(base,{status:'failed',error_code:'STEP_CAP_REACHED'})].map(d=>d.action==='pass'&&d.outcome),['skipped']);
 assert.equal(decideIdeaGate(base,{status:'succeeded',output:'garbage'}).action,'pass');
 assert.deepEqual([decideIdeaGate(base,{status:'succeeded',output:accepted})].map(d=>d.action==='pass'&&d.outcome),['accepted']);
 const revise=decideIdeaGate(base,{status:'succeeded',output:rejected()});assert.equal(revise.action,'revise');assert.match((revise as {note:string}).note,/^Automatic idea review \(not the AD\)/);
 assert.deepEqual([decideIdeaGate({...base,revisions:1},{status:'succeeded',output:rejected()})].map(d=>d.action==='pass'&&d.outcome),['passed'],'second rejection is only a note for the AD');
 assert.deepEqual([decideIdeaGate({reviews:1,revisions:1},null)].map(d=>d.action==='pass'&&d.outcome),['passed'],'no second review');
 // The re-run output starts a new review but keeps the step's counters.
 const next=gateFor({...base,revisions:1,jobId:'old',hash:'h'},{id:'new',job_key:'strategy',state:'succeeded',output_hash:'h2'});
 assert.deepEqual(next,{reviews:1,revisions:1,jobId:'new',hash:'h2'});
});

test('a run reviewed by the earlier whole-planning review keeps its used revision and accepted steps',()=>{
 const v1={version:1,key:'strategy:s1:h1|script:c1:h2|asset-plan:v1:h3',reviews:1,revisions:1,done:true,result:{accepted:false,summary:'x',directions:[],revision:{role:'script',note:'n'}}};
 const read=readIdeaReviewState(v1);
 assert.deepEqual(read.state.gates,{script:{reviews:1,revisions:1}});assert.deepEqual(read.accepted,[{job_id:'s1',output_hash:'h1'}]);
 assert.deepEqual(readIdeaReviewState({version:1,key:'strategy:s1:h1|script:c1:h2|asset-plan:v1:h3',revisions:0,done:true,result:{accepted:true}}).accepted.length,3);
 assert.deepEqual(readIdeaReviewState({version:1,key:'strategy:s1:h1|script:-:-|asset-plan:-:-',revisions:0,done:true,skipped:'x'}).accepted,[]);
 assert.deepEqual(readIdeaReviewState(undefined).state,{version:2,gates:{}});
 assert.deepEqual(ideaReviewLines({version:2,gates:{strategy:{reviews:1,revisions:0,status:'accepted'},script:{reviews:1,revisions:1,status:'revised'}}}).map(l=>l.status),['accepted','sent back for one revision']);
});

type Row=Record<string,unknown>;
function harness(over:{version?:string;queueError?:boolean;jobs?:Row[];gates?:Row[]}={}){
 const calls={posts:[] as {requestId:string;prompt:string}[],queued:[] as Row[],passed:[] as Row[]};
 const jobs=over.jobs??[{id:'s1',job_key:'strategy',state:'succeeded',output:outputs.strategy,output_hash:'h1'},{id:'c1',job_key:'script',state:'queued',output:null,output_hash:null},{id:'v1',job_key:'asset-plan',state:'queued',output:null,output_hash:null}];
 const gates=over.gates??[];
 const admin=createClient('http://127.0.0.1:9999','k',{global:{fetch:async(input,init)=>{const path=new URL(String(input)).pathname;
  if(path.endsWith('/rpc/studio_idea_review_version'))return Response.json(over.version??IDEA_REVIEW_VERSION);
  if(path.endsWith('/rpc/studio_queue_idea_revision')){if(over.queueError)return Response.json({code:'P0001',message:'CHANGE_PENDING'},{status:400});calls.queued.push(JSON.parse(String(init?.body)));return Response.json(true);}
  if(path.endsWith('/rpc/studio_pass_planning_gate')){const b=JSON.parse(String(init?.body));calls.passed.push(b);gates.push({job_id:b.target_job,output_hash:b.expected_hash});return Response.json(true);}
  if(path.endsWith('studio_workflow_jobs'))return Response.json(jobs);
  if(path.endsWith('studio_planning_gates'))return Response.json(gates);
  return Response.json([]);}}});
 let stepState:{status:string;output?:unknown;error_code?:string|null}|null=null;
 const ctx=(cursor:Row)=>({admin,control:{run_id:'run',lease_token:1},cursor,roundId:'round',local:async<T,>(_p:string,_m?:string,body?:unknown)=>{calls.posts.push(body as {requestId:string;prompt:string});return {id:'step-1'} as T;},step:async()=>stepState});
 return {calls,ctx,jobs,setStep:(s:typeof stepState)=>{stepState=s;}};
}
const gateOf=(cursor:Row,key:string)=>(cursor.ideaReview as IdeaReviewState).gates[key as 'strategy']!;

test('strategy: identity first, one request, wait, one correction to strategy only, then the revision continues without another paid review',async()=>{
 const h=harness(),cursor:Row={};
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.equal(h.calls.posts.length,0,'the first tick only saves the request identity');
 const id=gateOf(cursor,'strategy').requestId!;
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.equal(h.calls.posts.length,1);assert.equal(h.calls.posts[0].requestId,id);assert.match(h.calls.posts[0].prompt,/STRATEGY REVIEW/);
 h.setStep({status:'running'});assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.equal(h.calls.posts.length,1,'waiting never re-sends');
 h.setStep({status:'succeeded',output:rejected()});
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'revise');assert.deepEqual(h.calls.queued.map(q=>[q.change_id,q.agent_role]),[[id,'strategy']]);assert.equal(cursor.changeRequestId,id);assert.equal(h.calls.passed.length,0,'the rejected output stays held');
 // The change path replaced strategy with a revised output: it passes at once, with no second paid review.
 delete cursor.changeRequestId;h.jobs[0]={...h.jobs[0],id:'s2',output_hash:'h9'};h.setStep(null);
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.equal(h.calls.posts.length,1,'no second review');assert.equal(h.calls.queued.length,1,'never a second automatic revision');
 assert.deepEqual(h.calls.passed.map(p=>[p.target_job,p.gate_outcome]),[['s2','passed']]);
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'proceed','script has not run yet; nothing waits');
});

test('script then visual direction are reviewed in order and only after the earlier step finished its review',async()=>{
 const jobs=[{id:'s1',job_key:'strategy',state:'succeeded',output:outputs.strategy,output_hash:'h1'},{id:'c1',job_key:'script',state:'succeeded',output:outputs.script,output_hash:'h2'},{id:'v1',job_key:'asset-plan',state:'succeeded',output:outputs.visual,output_hash:'h3'}];
 const h=harness({jobs,gates:[{job_id:'s1',output_hash:'h1'}]}),cursor:Row={};
 await ideaReviewGates(h.ctx(cursor));await ideaReviewGates(h.ctx(cursor));assert.match(h.calls.posts[0].prompt,/SCENARIO REVIEW/);
 h.setStep({status:'succeeded',output:accepted});assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.deepEqual(h.calls.passed.map(p=>[p.target_job,p.gate_outcome]),[['c1','accepted']]);
 h.setStep(null);await ideaReviewGates(h.ctx(cursor));await ideaReviewGates(h.ctx(cursor));assert.match(h.calls.posts[1].prompt,/VISUAL DIRECTION REVIEW/);
 h.setStep({status:'succeeded',output:rejected('Generic look.')});assert.equal(await ideaReviewGates(h.ctx(cursor)),'revise');assert.equal(h.calls.queued[0].agent_role,'visual-direction');
});

test('the gates never block: no migration, an unqueueable correction or a failed review all continue',async()=>{
 const none=harness({version:'idea-review@1'}),c0:Row={};assert.equal(await ideaReviewGates(none.ctx(c0)),'proceed');assert.equal(c0.ideaReview,undefined,'without the migration nothing changes');
 const pending=harness({queueError:true}),c1:Row={ideaReview:{version:2,gates:{strategy:{reviews:1,revisions:0,jobId:'s1',hash:'h1',requestId:'r',stepId:'step-1'}}}};
 pending.setStep({status:'succeeded',output:rejected()});
 assert.equal(await ideaReviewGates(pending.ctx(c1)),'hold');assert.equal(gateOf(c1,'strategy').status,'skipped');assert.match(String(gateOf(c1,'strategy').reason),/could not be queued/);assert.equal(c1.changeRequestId,undefined);assert.equal(pending.calls.passed[0].gate_outcome,'skipped');
 const failed=harness(),c2:Row={ideaReview:{version:2,gates:{strategy:{reviews:1,revisions:0,jobId:'s1',hash:'h1',requestId:'r',stepId:'step-1'}}}};
 failed.setStep({status:'failed',error_code:'STEP_CAP_REACHED'});assert.equal(await ideaReviewGates(failed.ctx(c2)),'hold');assert.equal(failed.calls.passed[0].gate_outcome,'skipped');
});

test('a run from the earlier whole-planning review is not charged again for steps it accepted',async()=>{
 const jobs=[{id:'s1',job_key:'strategy',state:'succeeded',output:outputs.strategy,output_hash:'h1'},{id:'c2',job_key:'script',state:'succeeded',output:outputs.script,output_hash:'h5'},{id:'v1',job_key:'asset-plan',state:'queued',output:null,output_hash:null}];
 const h=harness({jobs}),cursor:Row={ideaReview:{version:1,key:'strategy:s1:h1|script:c1:h2|asset-plan:v1:h3',reviews:1,revisions:1,done:true,result:{accepted:false,summary:'x',directions:[],revision:{role:'script',note:'n'}}}};
 assert.equal(await ideaReviewGates(h.ctx(cursor)),'hold');assert.deepEqual(h.calls.passed.map(p=>[p.target_job,p.gate_outcome]),[['s1','accepted']]);assert.equal(h.calls.posts.length,0);
 // The script already had its review and revision in the earlier review: the re-run continues without a paid review.
 await ideaReviewGates(h.ctx(cursor));assert.equal(h.calls.posts.length,0);assert.equal(h.calls.queued.length,0);assert.deepEqual(h.calls.passed.map(p=>[p.target_job,p.gate_outcome]),[['s1','accepted'],['c2','passed']]);
});
