'use client';
import {Disclosure} from '@/components/ui/disclosure';
import {Select} from '@/components/ui/select';
import {useEffect,useState} from 'react';
import {Player} from '@remotion/player';
import {EngineBoardComposition,boardSize} from '@/remotion/EngineBoardComposition';
import type {DraftReviewView} from '@/packages/contracts/draft-review';
import type {FrameProgram} from '@/packages/contracts/frame-program';
import {studioRequest} from '@/lib/shared-http';
import {previewMediaBlob} from '@/packages/media/preview-blob';
import {Button} from '@/components/ui/button';
type Batch=DraftReviewView['batches'][number];
export function CreativeBoard({endpoint,batch,data}:{endpoint:string;batch:Batch;data:DraftReviewView}){
 const scope=data.scope!,[direction,setDirection]=useState(batch.summary.directions[0].id),[locale,setLocale]=useState(scope.referenceLocale),[hook,setHook]=useState(scope.hooks[0]),[duration,setDuration]=useState(scope.durationsSeconds[0]),[sequence,setSequence]=useState(scope.beatSequences[0]),[offer,setOffer]=useState(scope.offers[0]),[otherFormats,setOtherFormats]=useState(false),[safe,setSafe]=useState(false),[issues,setIssues]=useState(true),[contact,setContact]=useState(false),[loaded,setLoaded]=useState<{programs:FrameProgram[];urls:Record<string,string>}|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;const urls:string[]=[];
  async function load(){setLoaded(null);setMessage('Loading the selected formats…');const rows=data.manifest!.entries.filter(r=>r.locale===locale&&r.hook===hook&&r.durationSeconds===duration&&r.beatSequence===sequence&&r.offer===offer&&(data.audience==='ad'||otherFormats||r.placementId===scope.referencePlacement));
   // Candidate directions cover every ordered row; repeated concept slots share a board cell.
   const unique=rows.filter((r,i)=>rows.findIndex(v=>v.placementId===r.placementId)===i),programs:FrameProgram[]=[],resources=new Map<string,{sha256:string;mime:string;kind:string;objectKey:string}>();
   for(const row of unique){const result=await studioRequest<{program:FrameProgram}>(`${endpoint}&batch=${batch.id}&direction=${direction}&variant=${row.id}${otherFormats?'&otherFormats=true':''}`);if(!result.program.engine)throw new Error('This revision uses the historical draft player.');programs.push(result.program);for(const ref of result.program.engine.resources)if(ref.kind!=='font')resources.set(ref.revisionId,ref);}
   const assetUrls:Record<string,string>={};
   await Promise.all([...resources].map(async([id,ref])=>{const row=unique[programs.findIndex(p=>p.engine.resources.some(r=>r.revisionId===id))],base=`${endpoint}&batch=${batch.id}&direction=${direction}&variant=${row.id}${otherFormats?'&otherFormats=true':''}`;const signed=await studioRequest<{url:string;sha256:string}>(`${base}&asset=${encodeURIComponent(id)}`);if(signed.sha256!==ref.sha256)throw new Error('Saved source digest changed.');const response=await fetch(signed.url);if(!response.ok)throw new Error('Media download failed.');const blob=await previewMediaBlob(await response.arrayBuffer(),ref);if(!active)return;const url=URL.createObjectURL(blob);urls.push(url);assetUrls[id]=url;}));
   if(active){setLoaded({programs,urls:assetUrls});setMessage(programs.length?'':'There is no ordered combination for these filters.');}
  }
  load().catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Could not load this creative.');});return()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[endpoint,batch.id,direction,locale,hook,duration,sequence,offer,otherFormats,data.manifest,data.audience,scope.referencePlacement]);
 const select=(label:string,value:string,values:string[],change:(v:string)=>void)=><label>{label}<Select value={value} onChange={e=>change(e.target.value)}>{values.map(v=><option key={v}>{v}</option>)}</Select></label>;
 const size=boardSize(loaded?.programs??[],contact);
 return <section className="detail-panel" aria-label="Synchronized creative board"><h3>{data.audience==='ad'?'All ordered formats · one timeline':'Creative preview'}</h3><div className="studio-form">
 <label>Direction<Select value={direction} onChange={e=>setDirection(e.target.value)}>{batch.summary.directions.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</Select></label>
 {select('Locale',locale,scope.locales,setLocale)}{select('Hook',hook,scope.hooks,setHook)}{select('Duration',String(duration),scope.durationsSeconds.map(String),v=>setDuration(Number(v)))}{select('Beat sequence',sequence,scope.beatSequences,setSequence)}{select('Offer',offer,scope.offers,setOffer)}
 {data.audience==='client'&&<label><input type="checkbox" checked={otherFormats} onChange={e=>setOtherFormats(e.target.checked)}/> See other formats</label>}
 {data.audience==='ad'&&<><label><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Safe zones</label><label><input type="checkbox" checked={issues} onChange={e=>setIssues(e.target.checked)}/> Issue overlays</label><Button variant="outline" onClick={()=>setContact(!contact)}>{contact?'Return to timeline':'Contact sheet'}</Button></>}
 </div>{message&&<p role="status">{message}</p>}
 {loaded&&loaded.programs.length>0&&<><p>{loaded.programs.map(p=>`${p.placementId} · ${p.width}×${p.height}`).join(' / ')}</p><Player key={`${direction}.${locale}.${hook}.${duration}.${sequence}.${offer}.${contact}`} component={EngineBoardComposition} inputProps={{programs:loaded.programs,assetUrls:loaded.urls,safeZones:safe,issues,contactSheet:contact}} compositionWidth={size.width} compositionHeight={size.height} durationInFrames={duration*60} fps={60} controls={!contact} initiallyMuted style={{width:'100%'}}/>
 {data.audience==='ad'&&<Disclosure><summary>Issues and next actions</summary>{loaded.programs.flatMap(p=>p.engine.issues.map((issue,i)=><p key={`${p.id}.${i}`}>{p.placementId} · {issue.message} {issue.fix} · Owner: {issue.owner}</p>))}</Disclosure>}</>}
 </section>;
}
