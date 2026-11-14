// Exports one run for diagnosis: the most recent run, or the run whose id is given. Read-only: it selects rows and
// reads files, and writes only into the export folder. Keys, tokens and .env content are never read or written;
// every text is redacted (packages/data/run-export.ts). Usage:
//   node --import tsx scripts/export-run.ts [run-id] [--out <folder>]
import {mkdir,readFile,writeFile,readdir,stat,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadLocalEnv} from './local-env';
import {redactValue,redactText,requestComposition,requestsCsv,slimRunContext,safeName,neverExported,workspaceFileWanted,EXPORT_LAYOUT,type StepRow} from '../packages/data/run-export';

const args=process.argv.slice(2),outAt=args.indexOf('--out'),outRoot=resolve(outAt>=0&&args[outAt+1]?args[outAt+1]:'exports'),runArg=args.find((a,i)=>!a.startsWith('--')&&(outAt<0||i!==outAt+1));
const toggleHome=()=>process.env.TOGGLE_HOME??join(homedir(),'.toggle');
type Row=Record<string,unknown>;
const notes:string[]=[];
const write=async(folder:string,name:string,value:unknown)=>{const path=join(folder,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,typeof value==='string'?value:JSON.stringify(redactValue(value),null,1)+'\n');};

/** Every row of a table for a filter, in pages; a missing table or column is recorded, never fatal. */
async function rows(admin:SupabaseClient,table:string,filter:(q:ReturnType<ReturnType<SupabaseClient['from']>['select']>)=>unknown,order?:string):Promise<Row[]>{
 const out:Row[]=[];
 for(let from=0;;from+=1000){
  let q=admin.from(table).select('*');q=filter(q) as typeof q;if(order)q=q.order(order,{ascending:true});
  const r=await q.range(from,from+999);
  if(r.error){notes.push(`${table}: not read (${r.error.message.slice(0,160)})`);return out;}
  out.push(...(r.data as Row[]));if((r.data as Row[]).length<1000)return out;
 }
}
const walk=async(folder:string,limit=4000):Promise<string[]>=>{const out:string[]=[];const visit=async(dir:string)=>{let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}
 for(const e of entries){const path=join(dir,e.name);if(neverExported(path)||out.length>=limit)continue;if(e.isDirectory())await visit(path);else if(e.isFile())out.push(path);}};await visit(folder);return out;};

async function main(){
 loadLocalEnv();
 const {adminClient,sharedTenant}=await import('../packages/data/shared-runtime');
 const admin=adminClient();
 const run=runArg?(await rows(admin,'studio_runs',q=>q.eq('id',runArg)))[0]:((await admin.from('studio_runs').select('*').eq('tenant_id',sharedTenant).order('created_at',{ascending:false}).limit(1)).data as Row[]|null)?.[0];
 if(!run)throw new Error(runArg?`No run ${runArg}.`:'No run found.');
 const runId=String(run.id),stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19),folder=join(outRoot,`run-${runId.slice(0,8)}-${stamp}`);
 await mkdir(folder,{recursive:true});
 const byRun=(q:{eq:(c:string,v:string)=>unknown})=>q.eq('run_id',runId);
 // 1. The database: the run and everything that hangs on it.
 const db:Record<string,Row[]>={studio_runs:[run]};
 for(const [table,order] of [['studio_c1_checkpoints','created_at'],['studio_workflow_rounds','created_at'],['studio_workflow_jobs','created_at'],['studio_agent_steps','created_at'],['studio_director_blocks','created_at'],['studio_critic_checks','created_at'],
  ['studio_run_agent_limits',undefined],['studio_run_agent_overrides',undefined],['studio_run_limit_revisions','version'],['studio_run_budget_policy',undefined],['studio_campaign_run_controls',undefined],['studio_scenario_selections',undefined]] as [string,string|undefined][])
  db[table]=await rows(admin,table,byRun as never,order);
 db.studio_text_executions=await rows(admin,'studio_text_executions',q=>(q as unknown as {eq:(c:string,v:string)=>{eq:(c:string,v:string)=>unknown}}).eq('scope_kind','run').eq('scope_id',runId));
 const jobIds=db.studio_workflow_jobs.map(j=>String(j.id)),blockIds=db.studio_director_blocks.map(b=>String(b.id));
 const inList=(column:string,ids:string[])=>(q:{in:(c:string,v:string[])=>unknown})=>q.in(column,ids);
 db.studio_workflow_attempts=jobIds.length?await rows(admin,'studio_workflow_attempts',inList('job_id',jobIds) as never,'attempt_no'):[];
 db.studio_workflow_dependencies=jobIds.length?await rows(admin,'studio_workflow_dependencies',inList('job_id',jobIds) as never):[];
 for(const table of ['studio_director_work','studio_director_events','studio_director_iterations','studio_director_assessments','studio_director_deliveries','studio_director_delivery_events','studio_director_controls','studio_director_decisions'])
  db[table]=blockIds.length?await rows(admin,table,inList('block_id',blockIds) as never,table==='studio_director_work'?undefined:'created_at'):[];
 // Steps go to their own files (prompt and output in full); the table file keeps them without the long texts.
 const steps=db.studio_agent_steps as unknown as StepRow[],composition=steps.map(requestComposition);
 for(const [i,s] of steps.entries())await write(folder,`steps/${String(i+1).padStart(3,'0')}-${safeName(String((s.config_snapshot as Row|null)?.directorRole??s.role))}-${String(s.id).slice(0,8)}.json`,s);
 for(const [table,list] of Object.entries(db))await write(folder,`database/${table}.json`,table==='studio_agent_steps'?list.map(({prompt:_p,output:_o,...rest})=>{void _p;void _o;return rest;}):list);
 await write(folder,'summary/composition.json',composition);await write(folder,'summary/requests.csv',redactText(requestsCsv(composition)));
 // 2. This computer: the frozen run context, what each role asked for, and the conversations.
 let context:Row|null=null;try{context=JSON.parse(await readFile(join(toggleHome(),'local-claude','run-context',`${runId}.json`),'utf8')) as Row;}catch{notes.push('device/run-context.json: no frozen run context for this run on this computer');}
 if(context)await write(folder,'device/run-context.json',slimRunContext(context));
 try{await write(folder,'device/materials.jsonl',redactText(await readFile(join(toggleHome(),'local-claude','materials',`${runId.replace(/[^a-zA-Z0-9-]/g,'')}.jsonl`),'utf8')));}catch{/* none asked for */}
 // The complete requests as sent (the runner's own records; pictures are stored apart by hash and are not copied).
 let records=0;for(const [i,c] of composition.entries()){const path=typeof c.local.recordPath==='string'?c.local.recordPath:null;if(!path||neverExported(path)||!existsSync(path))continue;
  try{await write(folder,`device/requests/${String(i+1).padStart(3,'0')}-${safeName(String(c.directorRole??c.role))}.json`,JSON.parse(await readFile(path,'utf8')));records++;}catch{/* unreadable record */}}
 notes.push(`device/requests: ${records} of ${composition.length} complete request records found on this computer`);
 const sessions=[...new Set(composition.map(c=>c.local.sessionId).filter((s):s is string=>typeof s==='string'&&/^[\w-]{8,}$/.test(s)))];
 const claudeHome=process.env.CLAUDE_CONFIG_DIR??join(homedir(),'.claude'),transcripts=sessions.length&&existsSync(join(claudeHome,'projects'))?await walk(join(claudeHome,'projects'),20000):[];
 let found=0;
 for(const id of sessions){const file=transcripts.find(f=>f.endsWith(`${id}.jsonl`));if(!file)continue;found++;
  const text=(await readFile(file,'utf8')).split('\n').filter(Boolean).map(line=>{try{return JSON.stringify(redactValue(JSON.parse(line)));}catch{return redactText(line);}}).join('\n')+'\n';
  await write(folder,`device/sessions/${safeName(id)}.jsonl`,text);}
 notes.push(`device/sessions: ${found} of ${sessions.length} conversation transcripts found on this computer`);
 // 3. The designer: saved state, final source, reports and the hero render.
 for(const work of db.studio_director_work){
  const state=(work.state??{}) as {folder?:string;designer?:{hero?:{shots?:{file?:string}[]}}},dir=`designer/${String(work.direction_id).slice(0,8)}`;
  await write(folder,`${dir}/state.json`,{block_id:work.block_id,direction_id:work.direction_id,status:work.status,question:work.question,state:work.state});
  const source=state.folder&&existsSync(state.folder)?state.folder:null;if(!source){notes.push(`${dir}: its workspace folder is not on this computer`);continue;}
  let copied=0,bytes=0;const heroFiles=new Set((state.designer?.hero?.shots??[]).map(s=>s.file).filter((f):f is string=>!!f).map(f=>resolve(f)));
  for(const file of await walk(source)){const info=await stat(file).catch(()=>null);if(!info)continue;const rel=relative(source,file);
   const render=/(^|[\\/])(renders|\.shots|shots|out)[\\/]/.test(rel)&&/\.(png|jpe?g|webp)$/i.test(rel);
   if(!workspaceFileWanted(rel,info.size)||render&&!heroFiles.has(resolve(file))&&copied>400||bytes>150_000_000)continue;
   const target=join(folder,dir,'workspace',rel);await mkdir(dirname(target),{recursive:true});
   if(/\.(png|jpe?g|webp)$/i.test(rel))await copyFile(file,target);else await writeFile(target,redactText(await readFile(file,'utf8')));
   copied++;bytes+=info.size;}
  for(const file of heroFiles)if(existsSync(file)&&!file.startsWith(resolve(source))){await mkdir(join(folder,dir,'hero'),{recursive:true});await copyFile(file,join(folder,dir,'hero',safeName(file.split(/[\\/]/).pop()??'hero.png')));}
  notes.push(`${dir}: ${copied} workspace files (${Math.round(bytes/1024)} KB)`);
 }
 // 4. The overview: what a reader checks first.
 const blocks=db.studio_director_blocks.map(b=>{const snap=(b.snapshot??{}) as {inputs?:{directionId:string;brief?:Row}[];estimates?:Record<string,{roles?:Record<string,Row>;maxStills?:number;heroReviews?:number;ideasSelection?:number;maxModels?:number}>;models?:Record<string,{modelId?:string;liveReview?:boolean;vision?:boolean}>};
  return {id:b.id,status:b.status,created_at:b.created_at,approved_at:b.approved_at,models:Object.fromEntries(Object.entries(snap.models??{}).map(([k,m])=>[k,{modelId:m.modelId,liveReview:m.liveReview??false,vision:m.vision}])),
   directions:(snap.inputs??[]).map(i=>({directionId:i.directionId,designerVersion:i.brief?.designerVersion,synthesis:i.brief?.synthesis,synthesisAllowed:i.brief?.synthesisAllowed,materialsVersion:i.brief?.materialsVersion,digestVersion:i.brief?.digestVersion,
    maxStills:snap.estimates?.[i.directionId]?.maxStills,heroReviews:snap.estimates?.[i.directionId]?.heroReviews,ideasSelection:snap.estimates?.[i.directionId]?.ideasSelection,maxModels:snap.estimates?.[i.directionId]?.maxModels,roles:snap.estimates?.[i.directionId]?.roles}))};});
 const count=(key:(c:typeof composition[number])=>string)=>composition.reduce((m,c)=>{const k=key(c);m[k]=(m[k]??0)+1;return m;},{} as Record<string,number>);
 const designers=db.studio_director_work.map(w=>{const d=((w.state??{}) as {designer?:Row;phase?:string;localRecoveries?:number}).designer as {turn?:number;complete?:boolean;pictures?:number;ideas?:Row;hero?:Row;stageEOpened?:boolean;extensionPhase?:string;renders?:Row;session?:Row}|undefined;
  return {direction_id:w.direction_id,status:w.status,phase:(w.state as Row|null)?.phase,localRecoveries:(w.state as Row|null)?.localRecoveries,turn:d?.turn,complete:d?.complete,pictures:d?.pictures,ideas:d?.ideas,hero:d?.hero,stageEOpened:d?.stageEOpened,extensionPhase:d?.extensionPhase,renders:d?.renders,session:d?.session};});
 await write(folder,'summary/overview.json',{exportedAt:new Date().toISOString(),run:{id:run.id,name:run.name,status:run.status,created_at:run.created_at,cap_micro_usd:run.cap_micro_usd,charged_micro_usd:run.charged_micro_usd},
  textExecution:db.studio_text_executions[0]??null,runContextFlags:context?(slimRunContext(context) as {flags:unknown}).flags:null,stageSkillsVersion:(context?.stageSkills as {version?:string}|undefined)?.version??null,
  blocks,designers,requests:{total:steps.length,byRole:count(c=>c.directorRole?`${c.role}/${c.directorRole}`:c.role),byStatus:count(c=>c.status),byStage:count(c=>String(c.local.stage??'-')),byConversation:count(c=>String((c.local.conversation as {kind?:string}|null)?.kind??'-'))},
  criticChecks:db.studio_critic_checks.length,jobs:db.studio_workflow_jobs.map(j=>({job_key:j.job_key,role:j.role,state:j.state,blocker:j.blocker,attempt_count:j.attempt_count})),
  events:db.studio_director_events.length,notes});
 await write(folder,'README.txt',`Toggle run export\nRun ${runId}\nMade ${new Date().toISOString()} by scripts/export-run.ts (read-only).\n\nNothing here holds keys, tokens or .env content: every text was redacted, picture bytes inside requests were replaced by their size, and signed links lost their signatures.\n\nFiles\n${Object.entries(EXPORT_LAYOUT).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\nNotes\n${notes.map(n=>`- ${n}`).join('\n')||'- none'}\n`);
 // One file to send: a zip beside the folder when zip is available, else a tar.gz.
 const zip=`${folder}.zip`,zipped=spawnSync('zip',['-qr',zip,'.'],{cwd:folder});let archive:string|null=zipped.status===0?zip:null;
 if(!archive){const tar=`${folder}.tar.gz`;if(spawnSync('tar',['-czf',tar,'-C',folder,'.']).status===0)archive=tar;}
 console.log(`\nExported run ${runId}\nFolder: ${folder}${archive?`\nSend this file: ${archive}`:''}`);
 const win=(p:string)=>p.startsWith('/mnt/c/')?`C:\\${p.slice(7).replace(/\//g,'\\')}`:null;if(archive&&win(archive))console.log(`In Windows: ${win(archive)}`);
}
main().catch(error=>{console.error(`The export did not finish: ${error instanceof Error?error.message:error}`);process.exit(1);});
