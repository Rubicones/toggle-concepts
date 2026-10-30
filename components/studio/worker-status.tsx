"use client";

import { useEffect, useSyncExternalStore } from "react";
import { workerViewSchema, type WorkerView } from "@/packages/contracts/studio";

const empty: WorkerView = { online: false, status: null, reason: "not-started" };
let view=empty;
let latestRequest=0;
let pending:Promise<void>|undefined;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const getSnapshot=()=>view;
const getServerSnapshot=()=>empty;
function refresh():Promise<void> {
  if(pending)return pending;
  pending=readStatus().finally(()=>{pending=undefined;});
  return pending;
}
async function readStatus() {
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
  useEffect(()=>{
    let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
    // This observes a local heartbeat file, never Supabase. A dead process cannot
    // announce its own disappearance; retain a slower check only while visible.
    const visible=()=>document.visibilityState!=='hidden';
    const check=async()=>{clearTimeout(timer);if(closed||!visible())return;await refresh();if(!closed&&visible())timer=setTimeout(()=>void check(),15000);};
    const visibility=()=>{clearTimeout(timer);if(document.visibilityState!=='hidden')void check();};
    timer=setTimeout(()=>void check(),0);document.addEventListener('visibilitychange',visibility);
    return()=>{closed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return children;
}
export function useWorker() {
  // Each consumer gets the same initial server snapshot, even if another part
  // of the shell has already hydrated and polled before a deferred page hydrates.
  return {view:useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot),refresh};
}
