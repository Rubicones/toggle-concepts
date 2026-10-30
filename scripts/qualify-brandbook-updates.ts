import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import type {Client} from 'pg';
import {emptyBrief} from '../packages/contracts/brief';
import {defaultAgentSettings} from '../packages/agents/defaults';

/** Invoked only inside the loopback verifier's rollback transaction. */
export async function qualifyBrandbookUpdates(db:Client,tenant:string,actor:string){
 const campaign=randomUUID();
 await db.query("insert into public.campaigns(id,tenant_id,name,brand,created_by) values($1,$2,'Notes only','Test',$3)",[campaign,tenant,actor]);
 async function material(text:string){const id=randomUUID(),name=id+'.txt';await db.query('select public.studio_add_brand_material($1,$2,$3,$4,$4,$5,1,$6,$7,$8)',[campaign,id,randomUUID(),name,'text/plain','a'.repeat(64),`media/${tenant}/${campaign}/brand/${id}/source`,actor]);const lease=(await db.query('select * from public.studio_claim_brand_material($1)',[tenant])).rows[0];assert.equal(lease.id,id);await db.query('select public.studio_finish_brand_material($1,$2,$3,null)',[id,lease.lease_token,JSON.stringify({schemaVersion:'1.0',kind:'text',text,images:[],warnings:[],metadata:{}})]);return id;}
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint update_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to update_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const oldSource=await material('Original product. '+'x'.repeat(7000));
 const run=(await db.query('select * from public.studio_intake_run($1,1000000,$2)',[campaign,actor])).rows[0];
 const old=(await db.query('select * from public.studio_start_brand_analysis($1,$2,200,$3)',[campaign,randomUUID(),actor])).rows[0];
 const claim=async()=>(await db.query('select public.studio_claim_brand_read($1) claim',[tenant])).rows[0].claim;
 const agent=defaultAgentSettings.find(a=>a.role==='brand-kit')!;
 const begin=async(c:{part:{id:string;lease_token:number}})=>(await db.query('select * from public.studio_begin_brand_read($1,$2,$3,$4,$5,100)',[c.part.id,c.part.lease_token,randomUUID(),{instructions:agent.instructions,maxOutputTokens:1000,stepCapMicroUsd:agent.step_cap_micro_usd,requestPriceCapMicroUsd:200,modelId:agent.model_id,pricing:{inputPrice:0,outputPrice:0}},'Read this part'])).rows[0];
 const finish=async(c:{part:{id:string;lease_token:number}},s:{id:string},findings:unknown[],failure:string|null=null)=>(await db.query('select public.studio_complete_brand_read($1,$2,$3,$4,50,$5,null,null,$6,$7,false,null) ok',[c.part.id,c.part.lease_token,s.id,failure?'failed':'succeeded',JSON.stringify({findings,more:false}),failure,JSON.stringify(findings)])).rows[0].ok;
 const item=(field:string,value:string)=>({field,value,locator:'notes paragraph',evidence:'provided'});
 const first=await claim();assert.equal(first.file.material_id,oldSource);await finish(first,await begin(first),[item('brandDescription','A musician workspace.'),item('brief.audience','Musicians')]);
 const second=await claim();await finish(second,await begin(second),[],'OUTPUT_TOKEN_LIMIT');
 const notes=await material('Offer: free trial.');
 const key=randomUUID(),selectedArgs=[campaign,key,200,[notes],actor];
 await rejects(()=>db.query('select * from public.studio_start_selected_brand_analysis($1,$2,$3,$4,$5)',[campaign,randomUUID(),200,[notes],randomUUID()]),/FORBIDDEN/);
 const selected=(await db.query('select * from public.studio_start_selected_brand_analysis($1,$2,$3,$4,$5)',selectedArgs)).rows[0];
 assert.equal((await db.query('select * from public.studio_start_selected_brand_analysis($1,$2,$3,$4,$5)',selectedArgs)).rows[0].id,selected.id);
 assert.equal((await db.query('select status from public.studio_brand_analyses where id=$1',[old.id])).rows[0].status,'blocked');
 assert.deepEqual((await db.query('select material_id from public.studio_brand_file_reads where analysis_id=$1',[selected.id])).rows.map(r=>r.material_id),[notes]);
 const only=await claim();assert.equal(only.file.material_id,notes);
 assert.equal(await finish(only,await begin(only),[item('brief.offer','A free trial.')]),true);
 assert.equal(await claim(),null);
 assert.equal((await db.query('select status from public.studio_brand_analyses where id=$1',[selected.id])).rows[0].status,'completed');
 assert.equal((await db.query('select charged_micro_usd from public.studio_runs where id=$1',[run.id])).rows[0].charged_micro_usd,'150');
 await rejects(()=>db.query('select public.studio_continue_brand_analysis($1,200,$2)',[old.id,actor]),/REVIEW_REQUIRED/);
 const book=(await db.query('select * from public.studio_submit_brandbook($1,$2,$3)',[campaign,randomUUID(),actor])).rows[0];
 const source=(await db.query('select source_finding_id from public.studio_brandbook_submission_items where submission_id=$1',[book.id])).rows[0].source_finding_id;
 const briefRows=(await db.query('select id,field from public.studio_brand_brief_findings where campaign_id=$1',[campaign])).rows;
 const draft={...emptyBrief('Campaign goal'),audience:'Manual audience',ownerName:'AD'};
 await db.query('select public.studio_save_brief($1,0,$2,$3)',[campaign,draft,actor]);
 const suggestions=[{field:'product',value:'A musician workspace.',sources:[{kind:'finding',id:source}]},...briefRows.map(r=>({field:r.field,value:r.field==='audience'?'Musicians':'A free trial.',sources:[{kind:'brief',id:r.id}]}))];
 const apply=async(id:string,items:unknown[]=suggestions)=>(await db.query('select public.studio_apply_brandbook_brief($1,$2,$3,$4,$5) result',[id,emptyBrief(),JSON.stringify(items),'[]',actor])).rows[0].result;
 await rejects(()=>apply(book.id,[{field:'product',value:'Fake',sources:[{kind:'finding',id:randomUUID()}]}]),/FOREIGN_BRIEF_SOURCE/);
 await rejects(()=>apply(book.id,[{field:'rights',value:'confirmed',sources:[{kind:'finding',id:source}]}]),/INVALID_BRIEF_SUGGESTION/);
 const result=await apply(book.id);assert.deepEqual(Object.keys(result.fields).sort(),['offer','product']);
 const saved=(await db.query('select * from public.studio_brief_drafts where campaign_id=$1',[campaign])).rows[0];
 assert.equal(saved.payload.audience,'Manual audience');assert.equal(saved.payload.rights,'unknown');assert.equal(saved.payload.ownerName,'AD');assert.equal(saved.payload.objective,'Campaign goal');assert.equal(saved.payload.offer,'A free trial.');assert.equal(saved.version,2);
 assert.deepEqual(await apply(book.id),result);assert.equal((await db.query('select version from public.studio_brief_drafts where campaign_id=$1',[campaign])).rows[0].version,2);
 // A fixed C1 is never changed by a later working brandbook submission.
 const c1=randomUUID(),digest=createHash('sha256').update('{}').digest('hex');
 await db.query('insert into public.studio_c1_checkpoints(id,tenant_id,campaign_id,run_id,request_id,draft_version,payload,brief_text,config_text,created_by) values($1,$2,$3,$4,$5,2,$6,$7,$7,$8)',[c1,tenant,campaign,run.id,randomUUID(),{schemaVersion:'1.0',stage:'C1',id:c1,runId:run.id,campaignId:campaign,briefSubmission:{sha256:digest},executionConfig:{sha256:digest}},'{}',actor]);
 const later=(await db.query('select * from public.studio_submit_brandbook($1,$2,$3)',[campaign,randomUUID(),actor])).rows[0];assert.equal((await apply(later.id)).status,'c1_fixed');
 const rights=(await db.query("select has_function_privilege('authenticated','public.studio_apply_brandbook_brief(uuid,jsonb,jsonb,jsonb,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_brand_brief_findings','INSERT') direct")).rows[0];assert.equal(rights.client,false);assert.equal(rights.direct,false);
 console.log('PASS: 015 selected notes bypass older blocked files without reread; brief-only pages persist and complete; charges retained; snapshot prefill is blank-only/idempotent/cited; foreign sources and permission fields rejected; C1 fixed; ACL fences.');
 return {campaign,run:run.id,c1,book:later.id};
}
