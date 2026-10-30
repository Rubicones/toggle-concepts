export type ExtensionCommand={directionId:string;questionId:string;maxCostMicroUsd:number;requestId:string};
export type SavedExtension={blockId:string;directionId:string;questionId:string;decision:string};
/** Replay is resolved before looking for a question that the first approval already cleared. */
export async function continueAllowance(input:ExtensionCommand,deps:{saved:()=>Promise<SavedExtension|null>;replay:(saved:SavedExtension)=>Promise<void>;extend:()=>Promise<void>;wake:()=>Promise<void>}){
 const saved=await deps.saved();
 if(saved){if(saved.directionId!==input.directionId||saved.questionId!==input.questionId||!/^extend:(director|assembler|critic)$/.test(saved.decision))throw new Error('REQUEST_CONFLICT');await deps.replay(saved);}
 else await deps.extend();
 try{await deps.wake();}catch{return {message:'The added allowance is saved. Local processing has not confirmed a wake-up yet; use Continue work to check it. No second allowance is needed.'};}
 return {message:saved?'This continuation was already approved. The saved work continues within that allowance.':'The direction continues with the added allowance.'};
}
