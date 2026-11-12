"use client";
// LC5/LC6, Models & agents: skills attached to roles, and the effort per stage of shared Local runs.
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Disclosure} from "@/components/ui/disclosure";
import {studioRequest,useShared} from "@/lib/shared-http";

type Skill={id:string;title:string;purpose:string;version:string;tokens:number;roles:string[]};
type Data={ready:boolean;roles:string[];limits:{skill:number;role:number};skills:Skill[];common:string[];commonTokens:number;byRole:Record<string,{skills:string[];tokens:number}>;stages:{id:string;label:string;default:string;effort:string}[]};
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
  <p role="status">{message}</p>
 </section>;
}
