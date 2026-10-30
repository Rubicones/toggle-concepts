import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {DirectionInput} from '../../packages/director/types';
import {createWorkspace} from '../../apps/local-runner/director/workspace';
import {compositionTools} from '../../apps/local-runner/director/tools';
import {assemble} from '../../apps/local-runner/director/assembler';
async function main(){
 const input:DirectionInput=JSON.parse(await readFile('fixtures/director/input.json','utf8'));input.roundId='recorded-p3';
 const folder=await createWorkspace('artifacts/m08/workspaces',input);await cp('artifacts/m08/workspaces/sonicdesk/p0/d0/i0/public',resolve(folder,'public'),{recursive:true});await writeFile(resolve(folder,'catalog.json'),'[]');await mkdir(resolve(folder,'.reports'),{recursive:true});
 const source=await readFile('fixtures/director/Sonicdesk.tsx','utf8'),replies=[{calls:[{tool:'write',path:'Composition.tsx',source},{tool:'checks'}]},{calls:[{tool:'finish'}]}],tools=compositionTools(folder,input),state={turn:0,startedAt:Date.now(),transcript:[],complete:false};
 await assemble({state,maxTurns:4,maxToolCalls:8,timeMs:1800000,call:async()=>JSON.stringify(replies.shift()),tool:tools.execute,save:async value=>{await writeFile(resolve(folder,'.reports','checkpoint.json'),JSON.stringify(value));}});
 const result={complete:state.complete,turns:state.turn,reports:tools.reports};await writeFile('docs/m08/P3-assembly-fixture.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
