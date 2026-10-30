/** Let the independent coordinator persist a known terminal failure before SQL
 * admits its replacement. Never changes receipts, budgets, stages or leases. */
export type PreviewRetryControl={stage:string;status:string;blocker:string|null;cursor:{assemblyStepId?:unknown;assemblyImportedVersion?:unknown}};
export async function settlePreviewRetryState(options:{
 initialStep:string;
 read:()=>Promise<PreviewRetryControl|null>;
 wake:()=>Promise<void>;
 wait?:(ms:number)=>Promise<void>;
 timeoutMs?:number;
 now?:()=>number;
}){
 const now=options.now??Date.now,wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 let current=await options.read();
 const needsTick=()=>current?.stage==='assembly'&&current.status==='running'&&current.cursor.assemblyStepId===options.initialStep&&current.cursor.assemblyImportedVersion==null;
 if(!needsTick())return;
 await options.wake();
 const deadline=now()+(options.timeoutMs??12000);
 while(needsTick()){
  if(now()>=deadline)throw new Error('PREVIEW_RETRY_SETTLING');
  await wait(250);current=await options.read();
 }
}
