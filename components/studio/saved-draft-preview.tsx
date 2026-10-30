'use client';
/* eslint-disable @next/next/no-img-element -- immutable authenticated preview events */
import {Select} from '@/components/ui/select';
import {useState} from 'react';
import type {DirectorEvent} from '@/packages/director/events';
import type {Variant} from '@/packages/director/types';
import {savedPreviews} from '@/packages/director/saved-preview';
import {selectVariant,variantAxes} from '@/packages/director/variant-selection';
type Scene={sceneId:string;moments:{id:string;description:string}[]};
export function SavedDraftPreview({events,variants,iterationId,scenes=[]}:{events:DirectorEvent[];variants:Variant[];iterationId?:string;scenes?:Scene[]}){
 const frames=savedPreviews(events,variants,iterationId),[variantId,setVariantId]=useState(''),[sceneId,setSceneId]=useState(''),[moment,setMoment]=useState('');
 if(!frames.length)return null;
 const current=variants.find(v=>v.id===variantId)??frames[0].variant,orderedScenes=scenes.length?scenes:([...new Set(frames.map(f=>f.sceneId))].map(sceneId=>({sceneId,moments:frames.filter(f=>f.sceneId===sceneId).map(f=>({id:f.moment,description:f.moment})).filter((m,i,all)=>all.findIndex(v=>v.id===m.id)===i)})));
 const scene=orderedScenes.find(s=>s.sceneId===sceneId)??orderedScenes[0],selectedMoment=scene.moments.find(m=>m.id===moment)??scene.moments[0],frame=frames.find(f=>f.variant.id===current.id&&f.sceneId===scene.sceneId&&f.moment===selectedMoment.id);
 return <section aria-label="Saved draft preview"><h4>Saved preview · free</h4><p>Browse the stills already rendered. Switching here never starts work or spends allowance. Work in progress, not checked; saved images can come from different repair steps.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:12}}>{variantAxes.map(axis=><label key={axis}>{({format:'Format',locale:'Locale',hook:'Hook',cta:'CTA',length:'Length'} as const)[axis]}<Select aria-label={`Saved preview ${axis}`} value={String(current[axis])} onChange={e=>setVariantId(selectVariant(variants,current,axis,e.target.value).id)}>{[...new Set(variants.map(v=>String(v[axis])))].map(v=><option key={v} value={v}>{v}{axis==='length'?'s':''}</option>)}</Select></label>)}<label>Scene<Select aria-label="Saved preview scene" value={scene.sceneId} onChange={e=>{setSceneId(e.target.value);setMoment('');}}>{orderedScenes.map((s,i)=><option key={s.sceneId} value={s.sceneId}>Scene {i+1}</option>)}</Select></label><label>Moment<Select aria-label="Saved preview moment" value={selectedMoment.id} onChange={e=>setMoment(e.target.value)}>{scene.moments.map(m=><option key={m.id} value={m.id}>{m.description}</option>)}</Select></label></div>
 {frame?<figure><a href={frame.event.imageUrl} target="_blank" rel="noreferrer"><img style={{width:'100%',maxHeight:480,objectFit:'contain'}} src={frame.event.imageUrl} alt={`Scene ${orderedScenes.indexOf(scene)+1}: ${selectedMoment.description} · work in progress, not checked`}/></a><figcaption>{frame.event.proxy?'Still proxy · ':''}Saved {new Date(frame.event.at).toLocaleTimeString()} · work in progress, not checked. Open the image for full size.</figcaption></figure>:<p>No saved preview for this combination. Choosing it does not queue any work.</p>}
 </section>;
}
