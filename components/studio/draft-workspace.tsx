'use client';
import {Select} from '@/components/ui/select';
import {DirectorWorkspace} from './director-workspace';
import {useState,useEffect,useRef} from 'react';
import {Player} from '@remotion/player';
import {DraftComposition} from '@/remotion/DraftComposition';
import type {DraftProgram} from '@/packages/contracts/drafts';
import type {VariantEntry} from '@/packages/contracts/campaign';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {studioRequest,useShared} from '@/lib/shared-http';
import type {DraftWorkspaceRecord} from '@/packages/contracts/drafts';
import {WorkflowMigration} from './brief-workspace';
export function DraftWorkspace({campaignId}:{campaignId:string}){
 const {data,error,refresh}=useShared<DraftWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/drafts`);
 if(error)return <section className="detail-panel"><p role="alert">{error}</p><Button onClick={refresh}>Refresh drafts</Button></section>;
 if(!data)return <p role="status">Loading creative drafts…</p>;
 if(!data.c1Ready)return <WorkflowMigration stage="C1"/>;if(!data.a1Ready)return <WorkflowMigration stage="A1"/>;if(!data.workflowReady)return <WorkflowMigration stage="M06"/>;if(!data.schemaReady)return <WorkflowMigration stage="M07"/>;
 return <section className="detail-panel"><DirectorWorkspace campaignId={campaignId}/><p><Link href={`/campaigns/${campaignId}/run`}>Open the run dashboard</Link></p>{!!data.batches.length&&<p>Saved historical previews remain available in the review below.</p>}</section>;

}
/** Read-only player for saved historical compile reports. New work uses the creative board. */
export function DraftPlayer({campaignId,batchId,buildId,direction,rows,referenceLocale,referencePlacement}:{campaignId:string;batchId?:string;buildId?:string;direction:{id:string;title:string;idea:string};rows:VariantEntry[];referenceLocale:string;referencePlacement:string}){
 const [variant,setVariant]=useState(rows.find(r=>r.locale===referenceLocale&&r.placementId===referencePlacement)?.id??rows[0].id),[loaded,setLoaded]=useState<{program:DraftProgram;urls:Record<string,string>}|null>(null),[message,setMessage]=useState(''),urls=useRef<string[]>([]);
 useEffect(()=>()=>urls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
 async function load(){try{setMessage('Loading saved creative…');urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];setLoaded(null);const result=await studioRequest<{program:DraftProgram}>(`/api/studio/campaigns/${campaignId}/drafts?${buildId?`build=${buildId}`:`batch=${batchId}`}&direction=${direction.id}&variant=${variant}`),program=result.program,assets=program.scenes.flatMap(s=>s.assets).filter(a=>a.kind!=='font'),assetUrls:Record<string,string>={};
  for(const asset of assets){if(assetUrls[asset.revisionId])continue;const access=await studioRequest<{url:string;sha256:string;mime:string}>(`/api/secure/assets/${asset.revisionId}/read-access`,'POST'),response=await fetch(access.url);if(!response.ok)throw new Error('Source media is unavailable.');const bytes=await response.arrayBuffer(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==asset.sha256||digest!==access.sha256)throw new Error('Saved source digest changed.');const url=URL.createObjectURL(new Blob([bytes],{type:access.mime}));urls.current.push(url);assetUrls[asset.revisionId]=url;}
  setLoaded({program,urls:assetUrls});setMessage('');
 }catch(error){setMessage(error instanceof Error?error.message:'Could not load this saved build.');}}
 return <article><h3>{direction.title}</h3><p>{direction.idea}</p><label>Ordered variant<Select value={variant} onChange={e=>{setVariant(e.target.value);setLoaded(null);}}>{rows.map(r=><option key={r.id} value={r.id}>{r.locale} · {r.placementId} · {r.durationSeconds}s</option>)}</Select></label><Button onClick={()=>void load()}>Load saved creative</Button>{message&&<p role="status">{message}</p>}{loaded&&<Player component={DraftComposition} inputProps={{program:loaded.program,assetUrls:loaded.urls}} compositionWidth={loaded.program.width} compositionHeight={loaded.program.height} durationInFrames={loaded.program.durationFrames} fps={loaded.program.fps} controls style={{width:'100%'}}/>}</article>;
}
