"use client";
import {studioCampaignRecord} from "@/packages/contracts/campaign-record";
import { useSyncExternalStore } from "react";
import { studioStoreSchema,type StudioStore } from "@/packages/contracts/studio";
import { studioRequest } from "./shared-http";
import {subscribeStudioChanges} from './studio-events';
const initial:StudioStore={schemaVersion:"1.0",workspaceName:"Toggle Studio",interfaceLocale:"en",reducedMotion:false,campaigns:[]};
const serverSnapshot={data:initial,issue:null as string|null,ready:false};let snapshot=serverSnapshot;
const listeners=new Set<()=>void>();let unsubscribe:(()=>void)|undefined;let importing=false;let refreshRevision=0;
function publish(){for(const listener of listeners)listener();}
export async function reloadStudio(){
 const revision=++refreshRevision;try{const data=studioStoreSchema.parse(await studioRequest("/api/studio/state"));if(revision!==refreshRevision)return;snapshot={data,issue:null,ready:true};publish();
  if(!importing){importing=true;try{const prior=localStorage.getItem("toggle-studio.workspace.v1");if(prior){const parsed=studioStoreSchema.safeParse(JSON.parse(prior));if(parsed.success){for(const c of parsed.data.campaigns)await studioRequest("/api/studio/campaigns","POST",{name:c.name,brand:c.brand,goal:c.goal,legacyId:c.id});if(parsed.data.campaigns.length){const imported=studioStoreSchema.parse(await studioRequest("/api/studio/state"));if(revision===refreshRevision){snapshot={data:imported,issue:null,ready:true};publish();}}}}}catch{snapshot={...snapshot,issue:"Some previous browser campaigns could not be imported. Their original browser data is preserved."};publish();}}
 }catch(e){if(revision!==refreshRevision)return;snapshot={...snapshot,ready:true,issue:e instanceof Error?e.message:"Supabase is unavailable."};publish();}
}
function subscribe(listener:()=>void){listeners.add(listener);if(listeners.size===1){void reloadStudio();unsubscribe=subscribeStudioChanges('/api/studio/state',()=>void reloadStudio());}return()=>{listeners.delete(listener);if(!listeners.size){unsubscribe?.();unsubscribe=undefined;}};}
export function forgetStudioCampaign(id:string){refreshRevision++;snapshot={...snapshot,data:{...snapshot.data,campaigns:snapshot.data.campaigns.filter(c=>c.id!==id)}};publish();}
export function rememberStudioCampaign(c:{id:string;name:string;brand:string;goal:string;created_at:string}){refreshRevision++;snapshot={...snapshot,ready:true,data:{...snapshot.data,campaigns:[studioCampaignRecord(c),...snapshot.data.campaigns.filter(row=>row.id!==c.id)]}};publish();}
export async function saveStudio(update:(current:StudioStore)=>StudioStore){
 try{const current=snapshot.data,next=studioStoreSchema.parse(update(current));await studioRequest("/api/studio/state","PATCH",{workspaceName:next.workspaceName,reducedMotion:next.reducedMotion});
  for(const c of next.campaigns){const old=current.campaigns.find(row=>row.id===c.id);if(!old)await studioRequest("/api/studio/campaigns","POST",{name:c.name,brand:c.brand,goal:c.goal,legacyId:c.id});else if(old.goal!==c.goal)await studioRequest(`/api/studio/campaigns/${c.id}`,"PATCH",{goal:c.goal});}
  await reloadStudio();return {ok:true,message:"Saved to Supabase."};
 }catch(e){return {ok:false,message:e instanceof Error?e.message:"Could not save to Supabase."};}
}
export function useStudio(){return useSyncExternalStore(subscribe,()=>snapshot,()=>serverSnapshot);}
