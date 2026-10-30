import {createServer,type AddressInfo} from 'node:net';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sandboxTool} from '../../apps/local-runner/director/sandbox';
async function main(){const folder=resolve('artifacts/m08/sandbox-proof'),outsidePath='/private/tmp/m08-denied-'+randomUUID(),other=createServer(socket=>socket.end());await mkdir(folder,{recursive:true});await new Promise<void>(resolve=>other.listen(0,'127.0.0.1',resolve));try{const result=JSON.parse((await sandboxTool(folder,'probe',{otherPort:(other.address() as AddressInfo).port,outsidePath})).trim().split('\n').at(-1)!);await writeFile('docs/m08/P7-sandbox-fixture.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.ownServer||!result.otherLoopbackDenied||!result.outsideWriteDenied)throw new Error('SANDBOX_PROBE_FAILED');}finally{await rm(outsidePath,{force:true});await new Promise<void>(resolve=>other.close(()=>resolve()));}}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
