"use client";
// LC5/LC6/C3, Models & agents: skills attached to roles, the effort per stage and the material budgets of shared Local runs.
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Disclosure} from "@/components/ui/disclosure";
import {studioRequest,useShared} from "@/lib/shared-http";

type Skill={id:string;title:string;purpose:string;version:string;tokens:number;roles:string[]};
type Data={ready:boolean;roles:string[];limits:{skill:number;role:number};skills:Skill[];common:string[];commonTokens:number;byRole:Record<string,{skills:string[];tokens:number}>;stages:{id:string;label:string;default:string;effort:string}[];materials?:{ready:boolean;roles:{role:string;count:number;tokens:number;default:{count:number;tokens:number}}[]}};
const k=(n:number)=>n>=1000?`${(n/1000).toFixed(1)}k`:String(n);

export function SkillsPanel(){
 const {data,refresh}=useShared<Data>("/api/studio/skills",{live:false});const [message,setMessage]=useState("");
 if(!data)return null;
 const save=async(payload:unknown)=>{try{const r=await studioRequest<{message:string}>("/api/studio/skills","PUT",payload);setMessage(r.message);refresh();}catch(e){setMessage(e instanceof Error?e.message:"Save failed.");}};
 return <section className="detail-panel" aria-label="Skills">
  <h2>Skills</h2>
  <p>Short craft principles an agent reads with its instructions. A skill attached to every role is common: it is part of the shared context, prepared once per run. Changes apply to new runs.</p>
  {!data.ready&&<p className="notice">Apply migration 20261111000400_skills_and_stage_effort.sql in Supabase to attach skills and set effort per stage.</p>}
  <p className="muted">Common skills: {data.common.length?`${data.common.length} · ${k(data.commonTokens)} tokens`:"none"}. Each skill up to {k(data.limits.skill)} tokens; each role&apos;s own skills up to {k(data.limits.role)}.</p>
  {data.skills.map(s=><Disclosure key={s.id}><summary><strong>{s.title}</strong> · {k(s.tokens)} tokens · {s.roles.length===data.roles.length?"common":s.roles.length?`used by ${s.roles.length} role${s.roles.length===1?"":"s"}`:"not attached"}</summary>
   <p>{s.purpose}</p>
   <form className="studio-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({skillId:s.id,roles:data.roles.filter(r=>f.get(r)==="on")});}}>
    <fieldset disabled={!data.ready}><legend>Attached to</legend>{data.roles.map(r=><label className="checkbox-field" key={r}><input type="checkbox" name={r} defaultChecked={s.roles.includes(r)}/><span>{r}</span></label>)}</fieldset>
    <Button type="submit" disabled={!data.ready}>Save skill</Button>
   </form></Disclosure>)}
  <Disclosure><summary>Skills per role</summary><ul>{data.roles.map(r=><li key={r}><strong>{r}</strong>: {[...data.common,...(data.byRole[r]?.skills??[])].map(id=>data.skills.find(s=>s.id===id)?.title??id).join(", ")||"no skills"}{data.byRole[r]?.tokens?` · ${k(data.byRole[r].tokens)} tokens of its own`:""}</li>)}</ul></Disclosure>
  <h3>Effort per stage (shared Local runs)</h3>
  <p className="muted">How hard Claude thinks at each stage. High where the idea is invented; medium for repairs and revisions. Frozen with each run.</p>
  <ul>{data.stages.map(s=><li key={s.id}><label>{s.label}<Select disabled={!data.ready} value={s.effort} onChange={e=>void save({stage:s.id,effort:e.currentTarget.value})}>{["low","medium","high","xhigh","max"].map(v=><option key={v} value={v}>{v}{v===s.default?" (default)":""}</option>)}</Select></label></li>)}</ul>
  {data.materials&&<><h3>Materials on request (shared Local runs)</h3>
  <p className="muted">Every agent reads the short brand pack. When it needs more (a kit section, a photo, an interface part), it asks for it by name. These are the most each role may ask for in one run. Frozen with each run.</p>
  {!data.materials.ready&&<p className="notice">Apply migration 20261113000300_material_budgets.sql in Supabase to change these; until then the defaults apply.</p>}
  <ul>{data.materials.roles.map(m=><li key={m.role}><form className="studio-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({materialRole:m.role,count:Number(f.get("count")),tokens:Number(f.get("tokens"))});}}>
   <fieldset disabled={!data.materials!.ready}><legend>{m.role}</legend>
    <label>Materials<input name="count" type="number" min={0} max={20} defaultValue={m.count}/></label>
    <label>Tokens<input name="tokens" type="number" min={0} max={100000} step={1000} defaultValue={m.tokens}/></label>
    <Button type="submit">Save</Button><small className="muted"> default {m.default.count} · {k(m.default.tokens)}</small>
   </fieldset></form></li>)}</ul></>}
  <p role="status">{message}</p>
 </section>;
}
