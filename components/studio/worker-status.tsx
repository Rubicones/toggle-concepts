"use client";

import { useEffect, useSyncExternalStore } from "react";
import { workerViewSchema, type WorkerView } from "@/packages/contracts/studio";

const empty: WorkerView = { online: false, status: null, reason: "not-started" };
let view=empty;
let latestRequest=0;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const getSnapshot=()=>view;
const getServerSnapshot=()=>empty;
async function refresh() {
  const requestId=++latestRequest;
  let next:WorkerView;
  try {
    const response=await fetch("/api/local-worker",{cache:"no-store",signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw new Error("Status unavailable");
    next=workerViewSchema.parse(await response.json());
  }catch{next={online:false,status:null,reason:"unavailable"};}
  if(requestId===latestRequest){view=next;for(const listener of listeners)listener();}
}
export function WorkerProvider({children}:{children:React.ReactNode}) {
  useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),4000);return()=>{clearTimeout(initial);clearInterval(timer);};},[]);
  return children;
}
export function useWorker() {
  // Each consumer gets the same initial server snapshot, even if another part
  // of the shell has already hydrated and polled before a deferred page hydrates.
  return {view:useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot),refresh};
}
