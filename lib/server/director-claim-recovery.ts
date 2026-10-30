import 'server-only';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Private worker proof only. Never accept a browser-supplied claim or zero-cost assertion. */
export async function unsubmittedDirectorClaim(stepId:string){
 if(!/^[a-f0-9-]{36}$/.test(stepId))return null;
 const folder=resolve('artifacts/m08/claim-failures');
 for(const name of await readdir(folder).catch(()=>[])){
  if(!name.startsWith(stepId+'-')||!name.endsWith('.json')||name.includes('/'))continue;
  try{const p=JSON.parse(await readFile(resolve(folder,name),'utf8'));if(p.stepId===stepId&&p.phase==='claim-before-provider-submission'&&p.providerInvoked===false&&(p.evidence==='legacy-control-flow-audit'||p.evidence==='claim-rpc-threw'&&p.errorName==='TimeoutError'))return p;}catch{/* incomplete journal is not proof */}
 }
 return null;
}
