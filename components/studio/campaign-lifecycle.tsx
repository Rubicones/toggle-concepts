"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {studioRequest} from '@/lib/shared-http';
import {reloadStudio,forgetStudioCampaign} from '@/lib/studio-store';
import {flushCampaignSaves} from '@/lib/use-persisted-draft';
import type {CampaignDetail} from '@/packages/contracts/shared';
export function RemoveCampaign({id,name,redirect=false}:{id:string;name:string;redirect?:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),router=useRouter();
 async function remove(){setBusy(true);setError('');try{await flushCampaignSaves(id);const current=await studioRequest<CampaignDetail>(`/api/studio/campaigns/${id}`);await studioRequest(`/api/studio/campaigns/${id}`,'DELETE',{expectedVersion:current.campaign.version});forgetStudioCampaign(id);await reloadStudio();setOpen(false);if(redirect)router.push('/');}catch(e){setError(e instanceof Error?e.message:'Could not remove campaign.');}finally{setBusy(false);}}
 return <><Button variant="outline" type="button" onClick={()=>setOpen(true)}>Remove campaign</Button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent><DialogTitle>Remove {name}?</DialogTitle><DialogDescription>Remove this campaign from the active workspace. Its files, answers, drafts, runs, costs and checkpoint history stay in Supabase. You can restore it from Removed campaigns.</DialogDescription><p>Queued or running work continues and remains visible in Queue. Pause or cancel it there if needed.</p>{error&&<p role="alert">{error}</p>}<div className="data-heading-actions"><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Keep campaign</Button><Button disabled={busy} onClick={()=>void remove()}>{busy?'Saving and removing…':'Remove campaign'}</Button></div></DialogContent></Dialog></>;
}
