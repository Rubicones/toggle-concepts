'use client';
import {Disclosure} from '@/components/ui/disclosure';
import {Select} from '@/components/ui/select';
import {contrastRatio} from '@/packages/engine/engine/util';
import {useState} from 'react';
import {brandToKit} from '@/packages/engine/adapter';
import type {GraphicVocabulary} from '@/packages/brand/graphic-vocabulary';
import {Button} from '@/components/ui/button';
import type {BrandResolution} from '@/packages/brand/resolve-system';
export function CreativeReadiness({value,onGraphicChange}:{value:BrandResolution;onGraphicChange?:(v:GraphicVocabulary)=>Promise<void>}){
 const kit=brandToKit(value.system),[radius,setRadius]=useState('pill'),[fill,setFill]=useState(kit.treatments.button.kind==='button'?kit.treatments.button.fill:value.system.palette[0].id),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 const hex=(id:string)=>kit.colors[id]?.hex??id;
 const button=kit.treatments.button,plaque=kit.treatments.plaque,marker=kit.treatments.marker;
 const save=async()=>{if(!onGraphicChange)return;setSaving(true);try{await onGraphicChange({paints:kit.paints,treatments:{...kit.treatments,button:button.kind==='button'?{...button,fill,on:[...value.system.palette].sort((a,b)=>contrastRatio(b.hex,hex(fill))-contrastRatio(a.hex,hex(fill)))[0].id,radius:radius==='pill'?'pill':Number(radius)}:button},marks:kit.marks,icons:kit.graphics});setMessage('Saved as an accepted campaign rule. Publish and review the new brand revision to apply it to drafts.');}catch(e){setMessage(e instanceof Error?e.message:'Could not save graphics.');}finally{setSaving(false);}};
 const blocks=value.readiness.filter(i=>i.severity==='block'),warnings=value.readiness.filter(i=>i.severity!=='block');
 const palette=value.system.palette.filter(c=>c.roles.length);
 return <section className="detail-panel creative-readiness" aria-label="Creative readiness">
  <h3>{blocks.length?'Fix before the drafts can start':warnings.length?'Ready, with substitutes':'Brand files are ready'}</h3>
  <div className="readiness-summary">
   {value.system.fonts.map(f=><span key={f.role}><small>{f.role}</small>{f.family}</span>)}
   <span><small>logo</small>{value.system.logos.length?`${value.system.logos.length} file${value.system.logos.length>1?'s':''}`:'none'}</span>
   <span><small>colors</small>{palette.map(c=><i key={c.id} className="readiness-swatch" style={{background:c.hex}} title={`${c.hex} · ${c.roles.join(', ')}`}/>)}</span>
  </div>
  <div className="readiness-summary" aria-label="Brand graphic vocabulary">
   {Object.entries(kit.paints).map(([id,paint])=><span key={id} style={{padding:12,border:'1px solid currentColor',background:paint.kind==='gradient'?`linear-gradient(${paint.angle??0}deg,${paint.stops.map(s=>`${hex(s.color)} ${s.at*100}%`).join(',')})`:paint.kind==='flat'?hex(paint.color):undefined}}><small>{id}</small></span>)}
   <span style={{background:button.kind==='button'?hex(button.fill):undefined,color:button.kind==='button'?hex(button.on):undefined,borderRadius:24,padding:'10px 20px'}}>CTA button</span>
   <span style={{background:plaque.kind==='plaque'?hex(plaque.fill):undefined,color:plaque.kind==='plaque'?hex(plaque.on):undefined,padding:8}}>Offer plaque</span>
   <span><mark style={{background:marker.kind==='highlight'?hex(marker.fill):undefined,color:marker.kind==='highlight'&&marker.on?hex(marker.on):undefined}}>Emphasis marker</mark></span>
   {Object.entries({...kit.graphics,...kit.marks}).map(([id,v])=>v.shape&&<span key={id}><svg width="40" height="40" viewBox={`0 0 ${v.shape.view_box.join(' ')}`} aria-label={id}>{v.shape.paths.map((p,i)=><path key={i} d={p.d} fill={p.fill?hex(p.fill):'currentColor'} stroke={p.stroke?hex(p.stroke):undefined} strokeWidth={p.width}/>)}</svg>{id}</span>)}
  </div>
  {onGraphicChange&&<Disclosure><summary>Edit graphic defaults</summary><div className="studio-form"><label>Button shape<Select value={radius} onChange={e=>setRadius(e.target.value)}><option value="pill">Pill</option><option value="0.15">Rounded</option><option value="0">Square</option></Select></label><label>Button fill<Select value={fill} onChange={e=>setFill(e.target.value)}>{value.system.palette.map(c=><option key={c.id} value={c.id}>{c.id} · {c.hex}</option>)}</Select></label><Button disabled={saving} onClick={()=>void save()}>Save graphic defaults</Button></div></Disclosure>}
  {message&&<p role="status">{message}</p>}
  {!!blocks.length&&<ul className="readiness-list is-block" role="alert">{blocks.map(i=><li key={i.path+i.code}><strong>{i.message}</strong> {i.fix}</li>)}</ul>}
  {!!warnings.length&&<ul className="readiness-list">{warnings.map(i=><li key={i.path+i.code}>{i.message} <span>{i.fix}</span></li>)}</ul>}
  {!!value.fallbacks.length&&<Disclosure><summary>Technical defaults ({value.fallbacks.length})</summary><ul className="readiness-list is-tech">{value.fallbacks.map(f=><li key={f.path}><code>{f.path}</code> {f.reason}</li>)}</ul></Disclosure>}
 </section>;
}
