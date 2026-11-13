"use client";
// D2: the skill editor in Models & agents → Skills. The three parts in plain words, the stages as checkboxes, token
// counts, the stages it is used in with each stage's total against the budget, and a preview of exactly what a stage's
// creator message and the critic request will contain. The checks run on the server, on preview and on save.
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {studioRequest} from "@/lib/shared-http";

const STAGES:[string,string][]=[["ideas","Ideas and planning"],["visual-direction","Visual direction"],["hero","The hero frame"],["extension","Every scene, format and variation"],["pictures","Pictures"],["critic","The review"]];
export type EditableSkill={id:string;title:string;purpose:string;principles?:string;checkList?:string[];signsText?:string;stages?:string[]};
type Preview={check:{errors:string[];warnings:{line:string;message:string}[]};tokens:{principles:number;checks:number;signs:number;total:number};usedIn:string[];totals:{stage:string;label:string;tokens:number;budget:number}[];over:string[];creator:string;critic:string};
const approx=(text:string)=>text.trim()?Math.ceil(new TextEncoder().encode(text.trim()).length/4):0;
const label=(id:string)=>STAGES.find(([s])=>s===id)?.[1]??id;

export function SkillEditor({skill,ready,saved}:{skill:EditableSkill;ready:boolean;saved:()=>void}){
 const [title,setTitle]=useState(skill.title),[purpose,setPurpose]=useState(skill.purpose),[principles,setPrinciples]=useState(skill.principles??""),[checks,setChecks]=useState((skill.checkList??[]).join("\n")),[signs,setSigns]=useState(skill.signsText??"");
 const [stages,setStages]=useState<string[]>(skill.stages??[]),[stage,setStage]=useState((skill.stages??[])[0]??"hero"),[preview,setPreview]=useState<Preview|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const draft=()=>({title,purpose,stages,principles,checks:checks.split("\n").map(c=>c.trim()).filter(Boolean),signs});
 const counts={principles:approx(principles),checks:approx(checks),signs:approx(signs)};
 const look=async()=>{setBusy(true);try{setPreview(await studioRequest<Preview>("/api/studio/skills","POST",{skillId:skill.id,stage,draft:draft()}));setMessage("");}catch(e){setMessage(e instanceof Error?e.message:"The preview could not be made.");}finally{setBusy(false);}};
 const save=async()=>{setBusy(true);try{const r=await studioRequest<{message:string;warnings:Preview["check"]["warnings"]}>("/api/studio/skills","PUT",{skillId:skill.id,edit:draft()});setMessage(r.message+(r.warnings.length?` ${r.warnings.length} line${r.warnings.length===1?"":"s"} kept with a warning.`:""));saved();await look();}catch(e){setMessage(e instanceof Error?e.message:"Save failed.");}finally{setBusy(false);}};
 return <div className="studio-form" aria-label={`Edit ${skill.title}`}>
  {!ready&&<p className="notice">Update needed: apply migration 20261113000600_skill_texts.sql in Supabase to save skill texts. The preview works without it.</p>}
  <div className="shared-form-row"><label>Title<input value={title} maxLength={120} onChange={e=>setTitle(e.currentTarget.value)}/></label><label>What it is for (one line)<input value={purpose} maxLength={300} onChange={e=>setPurpose(e.currentTarget.value)}/></label></div>
  <label>For the designer <small className="muted">· what good looks like and why, written as what to do · about {counts.principles} tokens (about 600)</small><textarea rows={8} value={principles} onChange={e=>setPrinciples(e.currentTarget.value)}/></label>
  <label>Questions the reviewer answers <small className="muted">· one per line, each answered yes or no, three to six · about {counts.checks} tokens</small><textarea rows={5} value={checks} onChange={e=>setChecks(e.currentTarget.value)}/></label>
  <label>How the reviewer spots a problem <small className="muted">· how failure shows in a frame · about {counts.signs} tokens (about 300)</small><textarea rows={4} value={signs} onChange={e=>setSigns(e.currentTarget.value)}/></label>
  <p className="muted">In all about {counts.principles+counts.checks+counts.signs} tokens.{!checks.trim()?" No checks yet: the reviewer gets nothing from this skill until you add questions.":""}</p>
  <fieldset><legend>Used in stages</legend>{STAGES.map(([id,name])=><label className="checkbox-field" key={id}><input type="checkbox" checked={stages.includes(id)} onChange={e=>{const on=e.currentTarget.checked;setStages(s=>on?[...s,id]:s.filter(x=>x!==id));}}/><span>{name}</span></label>)}</fieldset>
  <div className="shared-form-row"><label>Preview the stage<Select value={stage} onChange={e=>setStage(e.currentTarget.value)}>{STAGES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select></label></div>
  <div className="data-heading-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>void look()}>Check and preview</Button><Button type="button" disabled={busy||!ready} onClick={()=>void save()}>Save skill text</Button></div>
  <p role="status">{message}</p>
  {preview&&<>
   {preview.check.errors.length>0&&<div className="notice" role="alert"><strong>Fix before saving:</strong><ul>{preview.check.errors.map(e=><li key={e}>{e}</li>)}</ul></div>}
   {preview.check.warnings.length>0&&<div className="notice"><strong>Worth a look (you may keep these):</strong><ul>{preview.check.warnings.map((w,i)=><li key={i}>{w.line?`"${w.line}": `:""}{w.message}</li>)}</ul></div>}
   {preview.over.length>0&&<p className="notice" role="alert">{preview.over.join(" ")}</p>}
   <p className="muted">Used in stages: {preview.usedIn.map(label).join(", ")||"none"}. Stage totals: {preview.totals.filter(t=>t.tokens).map(t=>`${t.label} ${t.tokens} of ${t.budget}`).join(" · ")}.</p>
   <h4>What the {label(stage).toLowerCase()} stage receives</h4>
   {stage==="critic"?<p className="muted">The review stage receives no designer text; see the critic request below.</p>:<pre className="shared-output">{preview.creator||"Nothing: no skill of this stage has a part for the designer."}</pre>}
   <h4>What the critic request contains</h4><pre className="shared-output">{preview.critic||"Nothing yet: no skill has questions or problem signs."}</pre>
  </>}
 </div>;
}
