"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import {DraftPersistence} from './draft-persistence';
type Entry={controller:DraftPersistence<unknown>;label:string;href:string};
const entries=new Map<string,Entry>(),listeners=new Set<()=>void>();
let globalState:{pending:number;errors:{key:string;label:string;href:string;message:string}[]}={pending:0,errors:[]};
const serverState=globalState;
function notify(){globalState={pending:[...entries.values()].filter(e=>{const s=e.controller.getSnapshot();return s.dirty||s.saving;}).length,errors:[...entries.entries()].flatMap(([key,e])=>{const s=e.controller.getSnapshot();return s.error?[{key,label:e.label,href:e.href,message:s.error}]:[];})};for(const f of listeners)f();}
export function discardPendingDraft(key:string){const controller=entries.get(key)?.controller;if(controller&&!controller.getSnapshot().saving)controller.discard();}
export function usePendingSaves(){return useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>globalState,()=>serverState);}
export async function flushCampaignSaves(campaignId:string){const versions:Record<string,number>={};for(const [key,e] of entries)if(key.includes(`/campaigns/${campaignId}`))versions[key]=await e.controller.flush();return versions;}
export function usePersistedDraft<T>({key,initial,initialVersion,write,label,href}:{key:string;initial:T;initialVersion:number;write:(value:T,version:number,previous:T)=>Promise<number>;label:string;href:string}){
 const [controller]=useState(()=>{const prior=entries.get(key);if(prior)return prior.controller as DraftPersistence<T>;const created=new DraftPersistence(initial,initialVersion,write,notify);entries.set(key,{controller:created as DraftPersistence<unknown>,label,href});return created;});
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 useEffect(()=>{controller.adopt(initial,initialVersion);},[controller,initial,initialVersion]);
 useEffect(()=>{
  const flush=()=>{void controller.flush().catch(()=>{});};
  const beforeUnload=(e:BeforeUnloadEvent)=>{const s=controller.getSnapshot();if(s.dirty||s.saving){e.preventDefault();e.returnValue='';}};
  const hidden=()=>{if(document.visibilityState==='hidden')flush();};
  window.addEventListener('beforeunload',beforeUnload);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('visibilitychange',hidden);flush();};
 },[controller]);
 return {...state,setValue:controller.set,save:()=>controller.flush(true),reset:controller.reset};
}
