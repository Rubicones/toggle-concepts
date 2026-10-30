import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {loadLocalEnv} from './local-env';
loadLocalEnv();
async function main(){
 const {objectStore}=await import('../packages/media/s3.server');const path='fixtures/creative/live/brand.json',fixture=JSON.parse(await readFile(path,'utf8'));await mkdir('fixtures/creative/resources',{recursive:true});let count=0;
 for(const material of fixture.materials){if(!material.metadata.family&&material.mime!=='image/svg+xml')continue;
  const bytes=(await objectStore().get(material.objectKey)).body;if(createHash('sha256').update(bytes).digest('hex')!==material.sha256)throw new Error('SOURCE_DIGEST_CHANGED');
  const name=`${material.id}.${material.metadata.family?'woff2':'svg'}`;await writeFile(`fixtures/creative/resources/${name}`,bytes);material.fixturePath=`fixtures/creative/resources/${name}`;
  if(material.metadata.family){const font=fontkit.create(bytes);if('fonts' in font)throw new Error('FONT_COLLECTION_UNSUPPORTED');Object.assign(material.metadata,{unitsPerEm:font.unitsPerEm,glyphCoverage:font.characterSet,averageAdvance:font.layout('abcdefghijklmnopqrstuvwxyz').positions.reduce((sum,p)=>sum+p.xAdvance,0)/26/font.unitsPerEm,weight:font['OS/2']?.usWeightClass??400});}
  else {const match=bytes.toString('utf8').match(/viewBox\s*=\s*["']([^"']+)["']/i);if(match)material.metadata.viewBox=match[1].trim().split(/[\s,]+/).map(Number);}
  count++;
 }
 await writeFile(path,JSON.stringify(fixture,null,2)+'\n');console.log(JSON.stringify({capturedResources:count}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'RESOURCE_CAPTURE_FAILED');process.exitCode=1;});
