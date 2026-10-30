"use client";
import {Button} from '@/components/ui/button';
import {SaveStatus} from './save-status';
import {studioRequest} from '@/lib/shared-http';
import {usePersistedDraft} from '@/lib/use-persisted-draft';
export function CampaignNotes({campaignId,section,title,description,initial,version}:{campaignId:string;section:string;title:string;description:string;initial:string;version:number}){
 const persisted=usePersistedDraft({key:`/api/studio/campaigns/${campaignId}:notes:${section}`,initial,initialVersion:version,label:title,href:`/campaigns/${campaignId}/${section==='brandKit'?'brand-kit':'brief'}`,write:async(value,_version,previous)=>{const result=await studioRequest<{version:number}>(`/api/studio/campaigns/${campaignId}`,'PATCH',section==='goal'?{goal:value,previousGoal:previous}:{document:{[section]:value},previousDocument:{[section]:previous}});return result.version;}});
 return <section className="detail-panel"><h2>{title}</h2><p>{description}</p><form className="studio-form" onSubmit={e=>{e.preventDefault();void persisted.save().catch(()=>{});}}><label>{title}<textarea rows={12} maxLength={section==='goal'?1200:20000} value={persisted.value} onChange={e=>persisted.setValue(e.target.value)}/></label><SaveStatus {...persisted} retry={persisted.save}/><Button type="submit" disabled={persisted.saving}>Save changes</Button></form></section>;
}
