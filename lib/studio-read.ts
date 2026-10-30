'use client';
import {studioConnected,subscribeStudioChanges,subscribeStudioConnection} from './studio-events';

// One read at a time for the lifetime of a mounted reader. Notifications arriving
// during a slow read coalesce into one follow-up instead of aborting/restarting it.
export function observeStudioRead(path:string,read:(signal:AbortSignal)=>Promise<void>,options:{live?:boolean;active?:()=>boolean;fallbackMs?:number}={}) {
 const controller=new AbortController();let closed=false,loading=false,dirty=false;
 let pending:ReturnType<typeof setTimeout>|undefined,fallback:ReturnType<typeof setTimeout>|undefined;
 const visible=()=>document.visibilityState!=='hidden';
 const armFallback=()=>{
  clearTimeout(fallback);
  if(!closed&&options.live!==false&&visible()&&!studioConnected()&&options.active?.())
   fallback=setTimeout(()=>{if(visible()&&!studioConnected()&&options.active?.())void load();else armFallback();},options.fallbackMs??30000);
 };
 const load=async()=>{
  if(closed)return;
  if(!visible()){dirty=true;return;}
  if(loading){dirty=true;return;}
  clearTimeout(pending);clearTimeout(fallback);loading=true;dirty=false;
  try{await read(controller.signal);}finally{
   loading=false;
   if(!closed){if(dirty&&visible())pending=setTimeout(()=>void load(),0);else armFallback();}
  }
 };
 const refresh=()=>{if(closed)return;dirty=true;clearTimeout(pending);if(!loading&&visible())pending=setTimeout(()=>void load(),300);};
 const visibility=()=>{clearTimeout(pending);clearTimeout(fallback);if(visible())refresh();};
 const unsubscribe=options.live===false?()=>{}:subscribeStudioChanges(path,refresh);
 const disconnect=subscribeStudioConnection(armFallback);
 document.addEventListener('visibilitychange',visibility);
 pending=setTimeout(()=>void load(),0);
 return {refresh,retry:(delay:number)=>{if(!closed&&visible()){clearTimeout(pending);pending=setTimeout(()=>void load(),delay);}},close:()=>{
  closed=true;clearTimeout(pending);clearTimeout(fallback);controller.abort();unsubscribe();disconnect();document.removeEventListener('visibilitychange',visibility);
 }};
}
