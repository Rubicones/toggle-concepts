import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {requestId,digest} from '../../../packages/director/money';
export async function sourceFiles(folder:string,iterationId:string){
 const files:{id:string;path:string;sha256:string;source:string}[]=[];let bytes=0;
 async function walk(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){if(['public','renders','bundle','snapshots','.tmp','.reports'].includes(e.name))continue;if(e.isSymbolicLink())throw new Error('WORKSPACE_SYMLINK_REJECTED');const path=resolve(dir,e.name);if(e.isDirectory())await walk(path);else if(/\.(ts|tsx|css|json)$/.test(e.name)){const source=await readFile(path,'utf8');bytes+=Buffer.byteLength(source);if(bytes>2*1024*1024)throw new Error('WORKSPACE_TOTAL_SIZE_LIMIT');const name=relative(folder,path);files.push({id:requestId({iterationId,path:name}),path:name,sha256:createHash('sha256').update(source).digest('hex'),source});}}}await walk(folder);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function snapshotFolder(folder:string,iterationId:string){const files=await sourceFiles(folder,iterationId),hash=digest(files.map(f=>({path:f.path,sha256:f.sha256})));await mkdir(resolve(folder,'snapshots'),{recursive:true});const path=resolve(folder,'snapshots',`${hash}.json`);await writeFile(path,JSON.stringify({iterationId,hash,files}),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});return {hash,files};}
