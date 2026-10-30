'use client';
/* eslint-disable @next/next/no-img-element -- authenticated signed stills */
import {Disclosure} from '@/components/ui/disclosure';
import {useCallback,useEffect,useRef,useState} from 'react';
import {studioRequest} from '@/lib/shared-http';
import {mergeDirectorEvents,type ActivityCursor,type DirectorActivityPage} from '@/packages/director/activity';
import {Button} from '@/components/ui/button';
import type {DirectorEvent} from '@/packages/director/events';
import {eventPriceLabel,latestSteps,publicStepMessage} from '@/packages/director/events';
import {DeferredDetails} from './deferred-details';
export function DirectorTimeline({events,scenes=[],endpoint,directionId}:{events:DirectorEvent[];scenes?:{sceneId:string}[];endpoint?:string;directionId?:string}){
 const steps=latestSteps(events),open=steps.filter(e=>e.status==='running'||e.status==='queued'),delivery=steps.findLast(e=>e.kind==='delivery'&&e.status==='done'),recent=open.length?open:delivery?[delivery]:steps.slice(-1);
 return <section className="director-timeline-activity" aria-label="Direction activity"><div className="director-timeline-heading"><h4>{open.length?'Working now':'Latest activity'}</h4><span>{steps.filter(e=>e.kind==='request').length} recent text requests · {steps.filter(e=>e.kind==='picture'&&e.status==='done').length} pictures</span></div>
  <div aria-live="polite" aria-relevant="additions text">{recent.length?<ol className="director-timeline-recent">{recent.map(event=><li key={event.stepId}><EventFact event={event} scenes={scenes}/></li>)}</ol>:<p>Waiting for the first saved step.</p>}</div>
  {!!events.length&&<DeferredDetails summary="Activity, costs and decisions"><PagedActivityHistory key={`${endpoint}:${directionId}`} events={events} scenes={scenes} endpoint={endpoint} directionId={directionId}/></DeferredDetails>}
 </section>;
}
function PagedActivityHistory({events,scenes,endpoint,directionId}:{events:DirectorEvent[];scenes:{sceneId:string}[];endpoint?:string;directionId?:string}){
 const [history,setHistory]=useState<DirectorEvent[]>([]),[page,setPage]=useState<DirectorActivityPage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const pending=useRef(false),abort=useRef<AbortController|null>(null);
 const load=useCallback(async(cursor?:ActivityCursor)=>{
  if(!endpoint||!directionId||pending.current)return;
  pending.current=true;setLoading(true);setError('');const controller=new AbortController();abort.current=controller;
  try{const next=await studioRequest<DirectorActivityPage>(`${endpoint}?activity=1&direction=${encodeURIComponent(directionId)}${cursor?`&before=${encodeURIComponent(JSON.stringify(cursor))}`:''}`,'GET',undefined,{signal:controller.signal});
   if(!controller.signal.aborted){setHistory(old=>mergeDirectorEvents(old,next.events));setPage(next);}
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Activity could not be loaded.');}
  finally{pending.current=false;if(!controller.signal.aborted)setLoading(false);}
 },[endpoint,directionId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);abort.current?.abort();};},[load]);
 const merged=mergeDirectorEvents(history,events);
 return <><ActivityHistory steps={latestSteps(merged)} events={merged} scenes={scenes} hasMore={!!page?.next} loading={loading} onMore={()=>void load(page?.next??undefined)}/>{loading&&<p role="status">Loading saved activity…</p>}{error&&<p role="alert">{error}</p>}{!loading&&error&&<Button variant="outline" onClick={()=>void load(page?.next??undefined)}>Retry saved activity</Button>}</>;
}
function ActivityHistory({steps,events,scenes,hasMore=false,loading=false,onMore}:{steps:DirectorEvent[];events:DirectorEvent[];scenes:{sceneId:string}[];hasMore?:boolean;loading?:boolean;onMore?:()=>void}){
 const [filter,setFilter]=useState('all'),[limit,setLimit]=useState(25),[query,setQuery]=useState('');
 const filtered=[...steps].reverse().filter(e=>(filter==='all'||filter==='requests'&&e.kind==='request'||filter==='pictures'&&e.kind==='picture'||filter==='decisions'&&['control','review','critic'].includes(e.kind)||filter==='code'&&['coder','checks','preview'].includes(e.kind))&&`${e.message} ${e.model??''}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="director-activity-browser"><div className="director-activity-filters" aria-label="Filter activity">{[['all','All activity'],['requests','Requests and cost'],['pictures','Pictures'],['code','Code and checks'],['decisions','Decisions']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setLimit(25);}}>{label}</button>)}<input aria-label="Search direction activity" placeholder="Search activity" value={query} onChange={e=>{setQuery(e.target.value);setLimit(25);}}/></div><p className="director-timeline-meta">{filtered.length} matching loaded steps · newest first</p><ol className="director-timeline-history">{filtered.slice(0,limit).map(event=><li key={event.stepId}><EventFact event={event} scenes={scenes} expanded/></li>)}</ol>{!filtered.length&&<p>No activity matches this filter.</p>}{(filtered.length>limit||hasMore)&&<Button variant="outline" disabled={loading} onClick={()=>{setLimit(n=>n+25);if(filtered.length<=limit)onMore?.();}}>Show earlier activity</Button>}<DeferredDetails summary={`Audit record · ${events.length} original transitions`}><AuditTransitions events={events}/></DeferredDetails></div>;
}
function AuditTransitions({events}:{events:DirectorEvent[]}){const [limit,setLimit]=useState(25);return <><ol className="director-timeline-history">{[...events].reverse().slice(0,limit).map(event=><li key={event.id}><p><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time> · {event.kind} · {event.status}</p><p>{publicStepMessage(event.message,4000)}</p><Disclosure><summary>Original event</summary><pre className="director-timeline-technical">{JSON.stringify(event,null,2)}</pre></Disclosure></li>)}</ol>{events.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+25)}>Show earlier transitions</Button>}</>;}
function EventFact({event,scenes,expanded=false}:{event:DirectorEvent;scenes:{sceneId:string}[];expanded?:boolean}){
 const writing=event.status==='running'&&event.kind==='request',role=(event.detail as {role?:string})?.role??'',price=eventPriceLabel(event);
 return <><p className="director-timeline-meta"><strong>{event.status==='done'?'Complete':event.status==='failed'?'Needs repair':event.status==='running'?'In progress':'Queued'}</strong> · <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>{['request','picture'].includes(event.kind)&&event.model?` · ${event.model}`:''}{price?` · ${price}`:''}</p>
  <p>{writing?`${({assembler:'The coder',director:'The director',critic:'The critic',resources:'The picture model'} as Record<string,string>)[role]??'The agent'} is writing its answer since ${new Date(event.startedAt??event.at).toLocaleTimeString()}.`:publicStepMessage(event.message)}</p>
  {expanded&&event.startedAt&&<p className="director-timeline-meta">Started {new Date(event.startedAt).toLocaleTimeString()}{event.endedAt?` · finished ${new Date(event.endedAt).toLocaleTimeString()}`:''}</p>}
  {event.kind==='checks'&&<CheckNotes detail={event.detail}/>}{event.kind==='review'&&<ReviewNote detail={event.detail} scenes={scenes}/>}
  {event.kind==='critic'&&<ul>{((event.detail as {notes?:{recipient:string;text:string}[]})?.notes??[]).map((n,i)=><li key={i}>{n.recipient==='director'?'Director':'Coder'}: {publicStepMessage(n.text)}</li>)}</ul>}
  {event.imageUrl&&<figure><img loading="lazy" src={event.imageUrl} alt={event.proxy?'Still proxy':event.kind==='render'?'Work in progress, not checked':'Picture resource'}/><figcaption>{event.proxy?'Still proxy · ':''}{event.kind==='render'?'Work in progress, not checked':event.prompt?publicStepMessage(event.prompt):''}</figcaption></figure>}
  {expanded&&event.kind==='design'&&<Disclosure><summary>Design document</summary><p className="director-timeline-document">{publicStepMessage(String((event.detail as {designDocument?:string})?.designDocument??''),16000)}</p></Disclosure>}
  {expanded&&<DeferredDetails summary="Technical details"><pre className="director-timeline-technical">{JSON.stringify(event,null,2)}</pre></DeferredDetails>}
 </>;
}
function CheckNotes({detail}:{detail:unknown}){
 const reports=(detail as {result?:{reports?:Record<string,{passed:boolean;findings:{message:string}[]}>}})?.result?.reports;
 return reports?<ul>{Object.entries(reports).map(([format,report])=><li key={format}>{format}: {report.passed?'passed':'needs work'}{report.findings.length>0&&<ul>{report.findings.map((f,i)=><li key={i}>{publicStepMessage(f.message)}</li>)}</ul>}</li>)}</ul>:null;
}
function ReviewNote({detail,scenes}:{detail:unknown;scenes:{sceneId:string}[]}){const note=detail as {text?:string;recipient?:string;target?:{revision:string;assetRevision:string;view:{sceneId:string;locale:string;hook:string;cta:string;width:number;height:number;length:number}}};if(!note?.target)return null;const {view}=note.target,index=scenes.findIndex(s=>s.sceneId===view.sceneId);return <div><p>{index>=0?`Scene ${index+1}`:'Viewed scene'} · {view.width} × {view.height} · {view.locale} · {view.hook} · {view.cta} · {view.length}s</p>{note.text&&<p>{note.recipient==='director'?'Director':'Coder'}: {publicStepMessage(note.text,4000)}</p>}<p className="director-timeline-meta">Viewed source {note.target.revision.slice(0,8)} · pictures {note.target.assetRevision.slice(0,8)}</p></div>;}
