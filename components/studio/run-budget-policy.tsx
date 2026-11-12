"use client";
// Budget re-approval for this run's local preview build: on (ask before each continuation price) or off (continue
// through the same priced extension without asking). Shown only for a Local run on this computer.
import {useState} from "react";
import {useShared,studioRequest} from "@/lib/shared-http";

type Policy={available:boolean;policy?:"ask"|"skip";reason?:string};

export function RunBudgetPolicy({runId}:{runId:string}){
 const {data,refresh}=useShared<Policy>(`/api/studio/runs/${runId}/budget-policy`,{live:false});const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 if(!data?.available)return null;
 const set=async(policy:"ask"|"skip")=>{setBusy(true);try{const r=await studioRequest<{message:string}>(`/api/studio/runs/${runId}/budget-policy`,"PUT",{policy});setMessage(r.message);refresh();}catch(e){setMessage(e instanceof Error?e.message:"The setting was not saved.");}finally{setBusy(false);}};
 return <div role="group" aria-label="Budget re-approval">
  <label className="checkbox-field"><input type="checkbox" checked={data.policy==="skip"} disabled={busy} onChange={e=>void set(e.currentTarget.checked?"skip":"ask")}/>
   <span>{data.policy==="skip"?"Budget re-approval is off for this local preview: it continues without asking for new prices. Costs are still counted; the run limit and Stop still apply.":"Continue this local preview without asking to approve more budget (costs are still counted; you can stop it at any time)."}</span></label>
  {message&&<p role="status">{message}</p>}
 </div>;
}
