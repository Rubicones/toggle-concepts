import {buildLivePreview} from './live-bundle';
import {createServer,createConnection} from 'node:net';
import {writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {bundleDirection,renderDirection} from './render';
import type {Variant} from '../../../packages/director/types';
async function main(){
const [operation,folder,encoded]=process.argv.slice(2),args=JSON.parse(encoded);
if(operation==='probe'){
 const server=createServer(socket=>socket.end());await new Promise<void>(resolve=>server.listen(Number(process.env.DIRECTOR_RENDER_PORT),'127.0.0.1',resolve));
 const connect=(port:number)=>new Promise<boolean>(resolve=>{const socket=createConnection({port,host:'127.0.0.1'});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.setTimeout(1500,()=>{socket.destroy();resolve(false);});});
 const ownServer=await connect(Number(process.env.DIRECTOR_RENDER_PORT)),otherLoopbackDenied=!await connect(args.otherPort);let outsideWriteDenied=false;try{await writeFile(args.outsidePath,'probe');}catch{outsideWriteDenied=true;}
 await new Promise<void>(resolve=>server.close(()=>resolve()));console.log(JSON.stringify({ownServer,otherLoopbackDenied,outsideWriteDenied}));
}
else if(operation==='preview')console.log(JSON.stringify(await buildLivePreview(folder)));
else if(operation==='inspect')console.log(JSON.stringify(await (await import('./live-inspect')).inspectLivePreview(folder,args.views)));
else if(operation==='bundle')console.log(JSON.stringify({bundle:await bundleDirection(folder)}));
else if(operation==='render')console.log(JSON.stringify(await renderDirection(folder,args.variant as Variant,args.options)));
else if(operation==='typecheck'){const result=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--project',resolve(folder,'tsconfig.json')],{encoding:'utf8'});console.log(result.stdout+result.stderr);process.exitCode=result.status??1;}
else throw new Error('UNKNOWN_TOOL');

}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
