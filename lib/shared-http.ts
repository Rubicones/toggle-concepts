"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import {readStudioResponse} from '@/packages/contracts/studio-response';
import {subscribeStudioChanges} from './studio-events';
import {observeStudioRead} from './studio-read';
export async function studioRequest<T=Record<string,unknown>>(path:string,method="GET",data?:unknown,options?:{signal?:AbortSignal}):Promise<T>{
 const response=await fetch(path,{method,cache:"no-store",signal:options?.signal,...(data instanceof FormData?{body:data}:data!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{})});
 return readStudioResponse<T>(response);
}
// Await durable worker output without repeatedly downloading unchanged records.
export function waitForStudio<T>(path:string,ready:(data:T)=>boolean,timeoutMs=60000):Promise<T>{
 return new Promise((resolve,reject)=>{
  const controller=new AbortController();let loading=false,dirty=false,finished=false;
  const finish=(error:unknown,value?:T)=>{if(finished)return;finished=true;clearTimeout(timeout);unsubscribe();controller.abort();if(error)reject(error);else resolve(value as T);};
  const check=async()=>{
   if(finished)return;if(loading){dirty=true;return;}loading=true;
   do{dirty=false;try{const data=await studioRequest<T>(path,'GET',undefined,{signal:controller.signal});if(!finished&&ready(data))finish(null,data);}catch(error){if(!finished)finish(error);}}while(!finished&&dirty);
   loading=false;
  };
  const unsubscribe=subscribeStudioChanges(path,()=>void check());
  const timeout=setTimeout(()=>finish(new Error('Local reading is still in progress. Your source is saved; analyze it when it is ready.')),timeoutMs);
  void check();
 });
}
export function useShared<T>(path:string,{live=true,isActive}:{live?:boolean;isActive?:(data:T)=>boolean}={}){
 const [value,setValue]=useState<{path:string;data:T}|null>(null),[error,setError]=useState("");
 const reader=useRef<ReturnType<typeof observeStudioRead>|null>(null),activeCheck=useRef(isActive);
 useEffect(()=>{activeCheck.current=isActive;},[isActive]);
 const refresh=useCallback(()=>reader.current?.refresh(),[]);
 useEffect(()=>{
  let active=true,latest:T|null=null;
  const observer=observeStudioRead(path,async signal=>{
   try{const data=await studioRequest<T>(path,'GET',undefined,{signal});if(active){latest=data;setValue({path,data});setError('');}}
   catch(e){if(active)setError(e instanceof Error?e.message:'Service unavailable.');}
  },{live,active:()=>latest!==null&&!!activeCheck.current?.(latest)});
  reader.current=observer;
  return()=>{active=false;observer.close();if(reader.current===observer)reader.current=null;};
 },[path,live]);
 return {data:value?.path===path?value.data:null,error,refresh};
}
