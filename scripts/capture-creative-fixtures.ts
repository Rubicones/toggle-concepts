// Read-only capture of already-paid planning output; never submits provider requests.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadLocalEnv} from './local-env';
loadLocalEnv();
async function main(){
 const {adminClient,checked,sharedTenant}=await import('../packages/data/shared-runtime');const admin=adminClient();
 const campaigns=checked(await admin.from('campaigns').select('id,name').eq('tenant_id',sharedTenant).ilike('name','%sonic%').order('created_at',{ascending:false}).limit(30));
 const populated=checked(await admin.from('studio_brand_revisions').select('campaign_id').eq('tenant_id',sharedTenant).in('campaign_id',(campaigns??[]).map(c=>c.id)));
 const campaign=campaigns?.find(c=>populated?.some(r=>r.campaign_id===c.id));if(!campaign)throw new Error('SONICDESK_CAMPAIGN_NOT_FOUND');
 const directory='fixtures/creative/live';await mkdir(directory,{recursive:true});
 const steps=checked(await admin.from('studio_agent_steps').select('id,role,output,created_at').eq('tenant_id',sharedTenant).eq('campaign_id',campaign.id).eq('status','succeeded').in('role',['research','strategy','variants','script','localization','visual-direction']).order('created_at',{ascending:false}));
 const roles=new Set<string>();for(const step of steps??[]){if(roles.has(step.role)||!step.output)continue;const output=JSON.parse(step.output);await writeFile(`${directory}/${step.role}.json`,JSON.stringify({provenance:{kind:'recorded-provider-output',stepId:step.id,capturedAt:step.created_at,sha256:createHash('sha256').update(step.output).digest('hex')},output},null,2)+'\n');roles.add(step.role);}
 const jobs=checked(await admin.from('studio_workflow_jobs').select('id,role,output,output_hash,created_at').eq('tenant_id',sharedTenant).eq('campaign_id',campaign.id).eq('state','succeeded').in('role',['research','strategy','variants','script','localization','visual-direction']).order('created_at',{ascending:false}));
 for(const job of jobs??[]){if(roles.has(job.role)||!job.output)continue;const output=JSON.parse(job.output);await writeFile(`${directory}/${job.role}.json`,JSON.stringify({provenance:{kind:'recorded-provider-output',workflowJobId:job.id,capturedAt:job.created_at,sha256:job.output_hash},output},null,2)+'\n');roles.add(job.role);}
 const bad=checked(await admin.from('studio_agent_steps').select('id,role,output,error_code,created_at').eq('tenant_id',sharedTenant).eq('campaign_id',campaign.id).eq('status','failed').not('output','is',null).in('role',['research','strategy','variants','script','localization','visual-direction']).order('created_at',{ascending:false}).limit(3));
 for(const step of bad??[])await writeFile(`${directory}/known-bad-${step.role}-${step.id.slice(0,8)}.json`,JSON.stringify({provenance:{kind:'recorded-provider-output',stepId:step.id,capturedAt:step.created_at,sha256:createHash('sha256').update(step.output).digest('hex')},expectedError:step.error_code,output:step.output},null,2)+'\n');
 if(process.argv.includes('--planning-only')){console.log(JSON.stringify({capturedRoles:[...roles],source:'saved results only'}));return;}
 const revision=checked(await admin.from('studio_brand_revisions').select('id,payload').eq('tenant_id',sharedTenant).eq('campaign_id',campaign.id).order('created_at',{ascending:false}).limit(1));
 const materials=checked(await admin.from('studio_brand_materials').select('id,sha256,mime,object_key,state,extraction').eq('tenant_id',sharedTenant).eq('campaign_id',campaign.id).eq('state','ready'));
 if(revision?.[0])await writeFile(`${directory}/brand.json`,JSON.stringify({id:revision[0].id,kit:revision[0].payload.kit,materials:(materials??[]).map(m=>({id:m.id,sha256:m.sha256,mime:m.mime,objectKey:m.object_key,state:m.state,metadata:m.extraction?.metadata??{}}))},null,2)+'\n');
 console.log(JSON.stringify({capturedRoles:[...roles],brand:!!revision?.length,materials:materials?.length??0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'FIXTURE_CAPTURE_FAILED');process.exitCode=1;});
