import {parseAssemblerReply,type AssemblerAction} from '../../../packages/agents/prompts/assembler-v1';
import type {LoopState} from '../../../packages/director/state';
import {OUTPUT_LIMIT_FEEDBACK} from '../../../packages/director/transcript';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
/** Provider and tool effects are injected for recorded verification. */
export async function assemble(args:{state:LoopState;maxTurns:number;maxToolCalls:number;timeMs:number;call:(state:LoopState)=>Promise<string>;tool:(action:AssemblerAction)=>Promise<unknown>;save:(state:LoopState)=>Promise<void>;now?:()=>number}){
 const now=args.now??Date.now;let tools=args.state.transcript.filter(t=>t.from==='tool').length;
 while(!args.state.complete&&args.state.turn<args.maxTurns&&tools<args.maxToolCalls&&now()-args.state.startedAt<args.timeMs){
  let text:string;
  // A reply cut off at the output limit is discarded; the agent is told why and the next turn is a new request.
  try{text=await args.call(args.state);}catch(error){if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){args.state.turn++;args.state.transcript.push({from:'tool',text:JSON.stringify({error:'OUTPUT_TOKEN_LIMIT',detail:OUTPUT_LIMIT_FEEDBACK})});await args.save(args.state);continue;}throw error;}
  args.state.transcript.push({from:'agent',text});args.state.turn++;
  try{
   const response=parseAssemblerReply(text);
   for(const r of response.rejected)args.state.transcript.push({from:'tool',text:JSON.stringify({tool:r.tool||'unknown',callIndex:r.index,error:r.error})});
   for(const action of response.calls){if(++tools>args.maxToolCalls)break;let result:unknown;try{result=await args.tool(action);if(action.tool==='finish'&&(result as {complete?:boolean})?.complete)args.state.complete=true;}catch(error){if(propagateExecutionFailure(error))throw error;result={error:error instanceof Error?error.message:'TOOL_FAILED'};}
    args.state.transcript.push({from:'tool',text:JSON.stringify({tool:action.tool,result:JSON.stringify(result).length>16384?{summary:JSON.stringify(result).slice(0,16384),truncated:true}:result})});await args.save(args.state);if(args.state.complete)break;
   }
  }catch(error){if(propagateExecutionFailure(error))throw error;args.state.transcript.push({from:'tool',text:JSON.stringify({error:'INVALID_TOOL_RESPONSE',detail:error instanceof Error?error.message:'Return valid tool JSON'})});}
  await args.save(args.state);
 }
 if(!args.state.complete)throw new Error('ASSEMBLER_ALLOWANCE_EXHAUSTED');return args.state;
}
