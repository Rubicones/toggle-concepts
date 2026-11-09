"use client";
// The Local / OpenRouter switch for this computer (docs/plans/2026-11-06-local-claude-pipeline-plan.md, §4).
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {studioRequest,useShared} from "@/lib/shared-http";

type LocalMode={mode:"openrouter"|"local_claude";updatedAt:string|null;schemaReady:boolean;blocked:string|null;device:{id:string;label:string}|null;
 profile:{cliVersion:string;model:string|null;textRoles:string;visualRoles:string;reasons:string[];limitations:string[];createdAt:string}|null};

export function LocalModePanel(){
 const state=useShared<LocalMode>("/api/studio/local-mode",{live:false});const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const data=state.data,local=data?.mode==="local_claude";
 const choose=async(mode:LocalMode["mode"])=>{setBusy(true);try{const result=await studioRequest<{message:string}>("/api/studio/local-mode","PUT",{mode});setMessage(result.message);state.refresh();}catch(error){setMessage(error instanceof Error?error.message:"The setting was not saved.");}finally{setBusy(false);}};
 return <section className="detail-panel" id="text-execution">
  <h2>Text agents: Local / OpenRouter {data&&<Badge variant={local?"blue":"outline"}>{local?"Local":"OpenRouter"}</Badge>}</h2>
  <p>Text agents use your Claude subscription on this device. Images and other generation remain paid through OpenRouter.</p>
  <p>This setting belongs to this computer and applies to new runs and brand analyses only. Runs already started keep their mode. Local results are for testing: they cannot be accepted at C2 or delivered to a client.</p>
  {data?.device&&<p>This computer: {data.device.label}.{data.profile?` Claude Code ${data.profile.cliVersion}, model ${data.profile.model??"not pinned"}; text roles ${data.profile.textRoles}, visual roles ${data.profile.visualRoles}.`:""}</p>}
  {data?.profile?.limitations.length?<details><summary>Known limits of this check</summary><ul>{data.profile.limitations.map(l=><li key={l}>{l}</li>)}</ul></details>:null}
  {data?.blocked&&<p role="note">{data.blocked}</p>}
  <div className="data-heading-actions">
   <Button disabled={busy||!data||local||!!data.blocked} onClick={()=>choose("local_claude")}>Use Local (Claude subscription)</Button>
   <Button variant="outline" disabled={busy||!data||!local} onClick={()=>choose("openrouter")}>Use OpenRouter</Button>
  </div>
  <p role="status">{message||state.error}</p>
 </section>;
}
