'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Select} from '@/components/ui/select';
import {studioRequest} from '@/lib/shared-http';
import {draftModelProblem} from '@/packages/director/role-models';
import type {CatalogModel} from '@/packages/agents/catalog';
type Agent={role:string;model_id:string|null;instructions:string;max_output_tokens:number;step_cap_micro_usd:number};
type Settings={agents:Agent[];models:CatalogModel[]};
/** Uses the same settings command as Models & agents. The quote never starts a paid request. */
export function PreviewModelPicker({disabled,onReady}:{disabled:boolean;onReady:()=>Promise<void>}){
 const [settings,setSettings]=useState<Settings|null>(null),[selected,setSelected]=useState({director:'',assembler:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(){setBusy(true);setError('');try{const data=await studioRequest<Settings>('/api/studio/agents','GET');setSettings(data);setSelected({director:data.agents.find(a=>a.role==='visual-direction')?.model_id??'',assembler:data.agents.find(a=>a.role==='creative-code')?.model_id??''});}catch(e){setError(e instanceof Error?e.message:'Could not load models.');}finally{setBusy(false);}}
 async function review(){if(!settings)return;setBusy(true);setError('');try{
  for(const [key,role] of [['director','visual-direction'],['assembler','creative-code']] as const){const agent=settings.agents.find(a=>a.role===role);if(!agent)throw new Error(`Configure ${role} in Models & agents first.`);const model=settings.models.find(m=>m.id===selected[key]);if(!model)throw new Error('Choose an available model.');if(selected[key]!==agent.model_id)await studioRequest('/api/studio/agents','POST',{role,modelId:model.id,instructions:agent.instructions,maxOutputTokens:Math.min(agent.max_output_tokens,model.maxOutput),stepCapMicroUsd:agent.step_cap_micro_usd});}
  await onReady();setSettings(null);
 }catch(e){setError(e instanceof Error?e.message:'Could not save models. Check Models & agents before retrying.');}finally{setBusy(false);}}
 return <div><Button variant="outline" disabled={disabled||busy} onClick={()=>void open()}>Rerun Build preview with new models…</Button>{settings&&<div role="region" aria-label="Build preview models"><p>Choose models, then review the new draft price. Only Build preview restarts, using the selected direction(s) and pipeline. Brandbook, questionnaire and planning stay saved.</p><p>These choices update Models & agents for future requests across the workspace. Already admitted requests keep their model. Images keep their existing model and paid route.</p>{([['director','Design / designer'],['assembler','Code (Director and coder pipeline)']] as const).map(([key,label])=><label key={key}>{label}<Select aria-label={label} value={selected[key]} disabled={busy} onChange={e=>setSelected(s=>({...s,[key]:e.target.value}))}><option value="">Choose a model</option>{settings.models.filter(m=>!draftModelProblem(key,m,m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></label>)}<p>For Local Claude, Claude Opus 5.5 maps to the CLI model claude-opus-5-5. Subscription access is checked when the request runs; no fallback to paid text.</p><Button disabled={busy||disabled||!selected.director||!selected.assembler} onClick={()=>void review()}>Save models and review restart price</Button><Button variant="outline" disabled={busy} onClick={()=>setSettings(null)}>Cancel</Button></div>}{error&&<p role="alert">{error}</p>}</div>;
}
