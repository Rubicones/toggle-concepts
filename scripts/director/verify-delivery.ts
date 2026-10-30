import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {criticEvidence} from '../../apps/local-runner/director/filmstrips';
import {validateDeliveryVariant} from '../../apps/local-runner/director/delivery';
import type {DirectionInput} from '../../packages/director/types';
async function main(){const input:DirectionInput=JSON.parse(await readFile('fixtures/director/input.json','utf8')),folder='artifacts/m08/workspaces/sonicdesk/recorded-p3/d0/i0',results=[];for(const variant of input.variants){validateDeliveryVariant(input,variant.id);const mp4=await readFile(resolve(folder,'renders',variant.id,'preview.mp4')),report=JSON.parse(await readFile(resolve(folder,'renders',variant.id,'checks.json'),'utf8'));if(mp4.subarray(4,8).toString()!=='ftyp'||!report.passed)throw new Error('DELIVERY_INVALID');results.push({variant:variant.id,mp4Bytes:mp4.length,sha256:createHash('sha256').update(mp4).digest('hex'),checksPassed:true});}const strips=await criticEvidence(folder,input);await writeFile('docs/m08/P5-delivery-fixture.json',JSON.stringify({variants:results,contactStrips:strips.manifest.length,uploaded:false},null,2));console.log(JSON.stringify({variants:results.length,contactStrips:strips.manifest.length,uploaded:false}));}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
