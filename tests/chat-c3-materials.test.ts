// Chat-shaped plan C3: materials on request. Recorded CLI answers only (tests/fixtures/fake-claude.mjs); no model call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recorded from '../fixtures/director/static/input.json';
import {planMaterials,withMaterialRequest,readWrapped,DEFAULT_MATERIAL_BUDGET,MATERIALS_PER_REQUEST,type MaterialEntry} from '../packages/agents/materials';
import {materialCatalogue,type PackFinding,type PackMaterial} from '../packages/brand/brand-pack-contents';
import {buildRunContext} from '../packages/agents/run-context';
import {agentResponseSchema} from '../packages/contracts/agent-output';
import {designerTurnResponseFor,designerTurnResponseV3,designerTurnResponseV3M,readDesignerTurn,usesMaterials} from '../packages/director/designer';
import {designerInstructionsFor} from '../packages/agents/prompts/designer-v1';
import {runDesigner,newDesignerState,type DesignerTools,type DesignerCall} from '../apps/local-runner/director/designer-loop';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {fetchMaterials,loadMaterials,materialsUsed} from '../apps/local-runner/local-claude/materials';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const photo=(()=>{const c=createCanvas(1200,900),g=c.getContext('2d');g.fillStyle='#c8b8a0';g.fillRect(0,0,1200,900);return c.toBuffer('image/jpeg',90);})();
const materials:PackMaterial[]=[{id:'1b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d61',filename:'Desk Photo.jpg',relative_path:'photos',mime:'image/jpeg',state:'ready',included:true,role:'photo',extraction:{kind:'image',images:[{objectKey:'media/brand/desk.jpg',sha256:sha(photo),page:1,width:1200,height:900}]}},
 {id:'2b6c9f6e-6a1a-4c3c-9d5e-3f1b2a4c5d62',filename:'guidelines.pdf',relative_path:'docs',mime:'application/pdf',state:'ready',included:true,role:'brandbook',extraction:{kind:'pdf'}}];
const findings:PackFinding[]=[{field:'imagery',value:'Daylight photographs, close crops',decision:'keep',material_id:materials[0].id},{field:'components',value:'Primary button with one accent',decision:'unreviewed',material_id:materials[1].id},{field:'voice',value:'Short level sentences',decision:'unreviewed',material_id:materials[1].id}];
const rule=(category:string,key:string,value:string)=>({category,key,value,decision:'accepted'});
const revision={kit:{instructions:'Calm, exact, generous with space.',boundaries:'Never alter the mark.',rules:[rule('color','ink','#101820'),rule('color','paper','#F4F1EA'),rule('voice','tone','dry and exact')]}};
const entries=materialCatalogue(revision,materials,findings);
const read=async(key:string)=>{if(key!=='media/brand/desk.jpg')throw new Error('missing');return photo;};

test('C3: every kit section and material is a catalogue entry with the text an agent gets when it asks', ()=>{
 assert.deepEqual(entries.map(e=>e.name),['kit-direction','kit-limits','kit-color','kit-voice','kit-components','desk-photo','guidelines']);
 assert.match(entries.find(e=>e.name==='kit-color')!.detail!,/^ink: #101820\npaper: #F4F1EA$/);
 assert.match(entries.find(e=>e.name==='kit-components')!.detail!,/Primary button with one accent/);
 assert.match(entries.find(e=>e.name==='guidelines')!.detail!,/voice: Short level sentences/);
 assert.equal(entries.find(e=>e.name==='kit-direction')!.detail,'Calm, exact, generous with space.');
});

test('C3: the budget per role and run: four per request, unknown names, already in the conversation, budget used', ()=>{
 const budget={count:2,tokens:100000},ask=(n:string[])=>n.map(name=>({name,why:'to see it'}));
 const plan=planMaterials(ask(['kit-color','nope','desk-photo','kit-voice','kit-limits','kit-direction']),entries,{role:'designer',budget,used:[]});
 assert.deepEqual(plan.map(p=>[p.name,p.status]),[['kit-color','attached'],['nope','not in the catalogue'],['desk-photo','attached'],['kit-voice','not fetched: budget used'],['kit-limits','not fetched: at most four per request'],['kit-direction','not fetched: at most four per request']]);
 assert.ok(plan[2].picture&&plan[2].tokens>0&&!plan[2].text);assert.equal(plan[0].text,'ink: #101820\npaper: #F4F1EA');
 const used=[{role:'designer',name:'kit-color',tokens:10},{role:'designer',name:'desk-photo',tokens:1000}];
 assert.equal(planMaterials(ask(['kit-color']),entries,{role:'designer',budget,used})[0].status,'attached','fetched before in this run: sent again without counting (the conversation started over)');
 assert.equal(planMaterials(ask(['kit-color']),entries,{role:'designer',budget,used,seen:['kit-color']})[0].status,'already in this conversation','never twice in one conversation');
 assert.equal(planMaterials(ask(['kit-voice']),entries,{role:'designer',budget:{count:5,tokens:2},used:[]})[0].status,'not fetched: budget used','tokens count too');
 assert.equal(planMaterials(ask(['kit-voice']),entries,{role:'critic',budget,used})[0].status,'attached','another role has its own budget');
 assert.equal(MATERIALS_PER_REQUEST,4);assert.ok(DEFAULT_MATERIAL_BUDGET.designer.count>DEFAULT_MATERIAL_BUDGET.research.count);
});

test('C3: schemas stay small; planning schemas are unchanged; the wrapper is a small alternative branch', ()=>{
 for(const role of ['research','strategy','variants','script','localization','visual-direction']){const s=agentResponseSchema(role).schema,w=withMaterialRequest(s);
  assert.ok(JSON.stringify(s).length<2400,role);assert.ok(JSON.stringify(w).length-JSON.stringify(s).length<=330,'wrapper overhead (321 characters)');assert.equal(w.additionalProperties,false);}
 assert.deepEqual(readWrapped({requestMaterials:[{name:'kit-color',why:'x'}],answer:null}),{request:[{name:'kit-color',why:'x'}]});
 assert.deepEqual(readWrapped({requestMaterials:[],answer:{role:'research'}}),{answer:{role:'research'}});assert.equal(readWrapped({requestMaterials:[],answer:null}),null);
 assert.ok(JSON.stringify(designerTurnResponseV3M.schema).length-JSON.stringify(designerTurnResponseV3.schema).length<320,'the designer field is small');
});

const runCtx=(budget=DEFAULT_MATERIAL_BUDGET)=>buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries,budget}});
const envelope=(role:string)=>({schemaVersion:'1.0',role,status:'draft',summary:'s'});

test('C3: a single-answer role asks once, the app answers in the same conversation, and the answer is its own schema', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c3-home-'));
 const f=fixture('plain-planning'),dir=await mkdtemp(join(tmpdir(),'c3-')),first=join(dir,'first.json'),second=join(dir,'second.json');
 const cfg={...f.cfg,outputFormat:'json_schema',responseSchema:agentResponseSchema('research')};
 const setup=await fakeSetup('structured',{FAKE_CLAUDE_RECORD:first,FAKE_CLAUDE_RECORD_RESUMED:second,FAKE_CLAUDE_STRUCTURED:JSON.stringify({requestMaterials:[{name:'kit-color',why:'exact colours'},{name:'desk-photo',why:'the light'}],answer:null}),FAKE_CLAUDE_STRUCTURED_RESUMED:JSON.stringify(envelope('research'))});
 const r=await cliTextTransport(setup,{shared:async()=>runCtx(),role:'research',runId:'run-c3',readPicture:read})(f.model,f.prompt,cfg) as LocalTextReceipt;
 assert.equal(r.outcome,'succeeded');assert.deepEqual(JSON.parse(r.text!),envelope('research'),'the answer, in the role\'s own schema');
 const a=JSON.parse(await readFile(first,'utf8')) as {args:string[];content:{type:string;text?:string}[]},b=JSON.parse(await readFile(second,'utf8')) as {args:string[];content:{type:string;text?:string;source?:{data:string}}[]};
 const schemaOf=(args:string[])=>JSON.parse(args[args.indexOf('--json-schema')+1]);
 assert.ok(schemaOf(a.args).properties.requestMaterials,'first call: two branches');assert.match(String(a.content.at(-1)!.text),/^MATERIALS ON REQUEST/);
 assert.ok(!a.args.includes('--no-session-persistence'),'the conversation is kept for the answer');
 assert.equal(b.args[b.args.indexOf('--resume')+1],'s1');assert.ok(!b.args.includes('--fork-session'));assert.deepEqual(schemaOf(b.args),cfg.responseSchema.schema,'the answer: the role\'s own schema');
 assert.match(String(b.content[0].text),/kit-color:\nink: #101820/);assert.equal(b.content.filter(c=>c.type==='image').length,1,'the picture as a picture');
 assert.equal(r.local?.materials?.attached.join(','),'kit-color,desk-photo');assert.equal((r.usage as {prompt_tokens:number}).prompt_tokens,240,'both calls counted');
 assert.equal((await materialsUsed('run-c3')).length,2,'the run ledger');
 // The same role in the same run: its budget (3) has one left; a third and fourth name are refused.
 const again=await fetchMaterials(runCtx(),{runId:'run-c3',role:'research',requests:[{name:'kit-voice',why:'x'},{name:'kit-limits',why:'y'}],read});
 assert.deepEqual(again.plan.map(p=>p.status),['attached','not fetched: budget used']);assert.match(again.text,/kit-limits: not fetched: budget used\./);
});

test('C3: answering directly takes one call; contexts without materials keep the exact earlier request', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c3-home2-'));
 const f=fixture('plain-planning'),dir=await mkdtemp(join(tmpdir(),'c3b-')),rec=join(dir,'r.json'),cfg={...f.cfg,outputFormat:'json_schema',responseSchema:agentResponseSchema('strategy')};
 const direct=await cliTextTransport(await fakeSetup('structured',{FAKE_CLAUDE_RECORD:rec,FAKE_CLAUDE_STRUCTURED:JSON.stringify({requestMaterials:[],answer:envelope('strategy')})}),{shared:async()=>runCtx(),role:'strategy',runId:'run-d'})(f.model,f.prompt,cfg) as LocalTextReceipt;
 assert.deepEqual(JSON.parse(direct.text!),envelope('strategy'));assert.equal(direct.local?.materials,undefined);
 const old=buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND PACK text'}),rec2=join(dir,'old.json');
 await cliTextTransport(await fakeSetup('structured',{FAKE_CLAUDE_RECORD:rec2,FAKE_CLAUDE_STRUCTURED:JSON.stringify(envelope('strategy'))}),{shared:async()=>old,role:'strategy',runId:'run-d'})(f.model,f.prompt,cfg);
 const sent=JSON.parse(await readFile(rec2,'utf8')) as {args:string[];content:{text?:string}[]};
 assert.deepEqual(JSON.parse(sent.args[sent.args.indexOf('--json-schema')+1]),cfg.responseSchema.schema,'no materials in a context frozen before C3');
 assert.ok(!sent.content.some(c=>/MATERIALS ON REQUEST/.test(c.text??'')));
 const noBudget=await cliTextTransport(await fakeSetup('structured',{FAKE_CLAUDE_RECORD:rec2,FAKE_CLAUDE_STRUCTURED:JSON.stringify(envelope('strategy'))}),{shared:async()=>runCtx({...DEFAULT_MATERIAL_BUDGET,strategy:{count:0,tokens:0}}),role:'strategy',runId:'run-d'})(f.model,f.prompt,cfg);
 assert.equal(noBudget.outcome,'succeeded','a role with no budget is not offered materials');
});

const designerInput=(materialsVersion?:number)=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:3,...(materialsVersion?{materialsVersion}:{})};return i;};
test('C3: the designer names materials; they arrive with the next turn; never resent in a continued conversation', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c3-home3-'));
 const i=designerInput(1),old=designerInput();
 assert.equal(usesMaterials(i),true);assert.equal(usesMaterials(old),false);assert.equal(designerTurnResponseFor(old).name,'designer_turn_v3','earlier blocks keep their schema');
 assert.equal(designerTurnResponseFor(i).name,'designer_turn_v3_materials');assert.match(designerInstructionsFor(i),/MATERIALS\. /);assert.doesNotMatch(designerInstructionsFor(old),/MATERIALS\. /);
 assert.throws(()=>readDesignerTurn({focus:{sceneId:i.storyboard[0].id,activity:'designing',about:'x'},materials:[{name:'kit-color',why:'x'}]},old),'an earlier block cannot ask');
 const folder=await mkdtemp(join(tmpdir(),'c3-ref-'));await writeFile(join(folder,'ref.jpg'),photo);
 const ctx=runCtx(),refs:MaterialEntry[]=[{name:'ref-logo',kind:'logo',line:'your logo',size:'picture',file:join(folder,'ref.jpg')}],timeline:string[]=[];
 const tools:DesignerTools={files:async()=>[{path:'Frame.tsx',source:'export default 1;'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
  render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]},shots:[]}),
  materials:{references:['- ref-logo · logo · your logo'],fetch:async(requests,seen)=>{const f=await fetchMaterials(ctx,{runId:'run-designer',role:'designer',requests,extra:refs,seen,read});const attached=f.plan.filter(p=>p.status==='attached').map(p=>p.name);if(attached.length)timeline.push(`The designer looked at: ${attached.join(', ')}.`);return {attached,lines:f.plan.map(p=>`${p.name}: ${p.status}`)};},
   load:names=>loadMaterials(ctx,names,refs,read),left:async()=>3}};
 const sent:{request:Parameters<DesignerCall>[0];images:number}[]=[],answers=[['kit-color','ref-logo'],['kit-color'],[]];
 await runDesigner({input:i,state:newDesignerState(),maxTurns:3,maxPictures:0,timeMs:60000,tools,save:async()=>{},conversation:{continuing:()=>true,decide:async()=>true,accept:async()=>{}},
  call:async(request,images)=>{sent.push({request:structuredClone(request),images:images.length});const names=answers[sent.length-1];return JSON.stringify({focus:{sceneId:i.storyboard[0].id,activity:'designing',about:'x'},notes:'n',...(names.length?{materials:names.map(name=>({name,why:'to see it'}))}:{})});}});
 assert.equal(sent[0].request.budget.materialsLeft,3);assert.deepEqual(sent[0].request.references,['- ref-logo · logo · your logo']);assert.equal(sent[0].request.materials,undefined);
 assert.match(String(sent[1].request.materials),/kit-color:\nink: #101820/);assert.equal(sent[1].images,1,'the reference picture arrives as a picture');
 assert.equal(sent[2].request.materials,undefined,'asked again in the same conversation: not resent');assert.equal(sent[2].images,0);
 assert.deepEqual(timeline,['The designer looked at: kit-color, ref-logo.']);
});
