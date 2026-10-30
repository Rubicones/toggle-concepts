import {readFile,writeFile} from 'node:fs/promises';
import type {DirectionInput} from '../../packages/director/types';
import {criticEvidence} from '../../apps/local-runner/director/filmstrips';
import {readCritique,critiqueDecision} from '../../packages/director/critic';
async function main(){const input:DirectionInput=JSON.parse(await readFile('fixtures/director/input.json','utf8')),evidence=await criticEvidence('artifacts/m08/workspaces/sonicdesk/recorded-p3/d0/i0',input),critique=readCritique(JSON.parse(await readFile('fixtures/director/critic-response.json','utf8')));if(evidence.manifest.length!==4||evidence.images.length!==20)throw new Error('EVIDENCE_COVERAGE');const result={formats:evidence.manifest.map(m=>({format:m.format,frames:m.frames.length,previewFrames:m.previews.length})),imageCount:evidence.images.length,recordedDecision:critiqueDecision(critique,1,{directionId:input.directionId,iterationIds:[input.iterationId]}).state,liveVisualAssessment:false};await writeFile('docs/m08/P4-critic-fixture.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
