import {availableRenderPort} from '../render-port';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,realpath,symlink,rm,writeFile,chmod,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {limits} from '../../../packages/director/policy.local';
const exec=promisify(execFile);
/** Mandatory macOS OS sandbox; fails closed on other platforms until an equivalent is configured. */
export async function sandboxTool(folder:string,operation:'bundle'|'render'|'typecheck'|'probe'|'preview',args:unknown,runtimeLimitMs:number=limits.renderMs,onStill?:(value:{variantId:string;sceneId:string;moment:string;file:string})=>Promise<void>){
 if(process.platform!=='darwin')throw new Error('DIRECTOR_OS_SANDBOX_UNAVAILABLE');
 const root=await realpath(folder),temp=resolve(root,'.tmp',randomUUID());await mkdir(temp,{recursive:true});
 const shortTemp='/private/tmp/m08-'+createHash('sha256').update(temp).digest('hex').slice(0,12);await rm(shortTemp,{force:true});await symlink(temp,shortTemp);
 const renderPort=(operation==='render'||operation==='probe')?await availableRenderPort():0,debugPort=(operation==='render'||operation==='probe')?await availableRenderPort():0;
 let browserPath:string|undefined;
 if(operation==='render'){
  const arch=process.arch==='arm64'?'arm64':'x64',actual=process.env.DIRECTOR_CHROME_PATH??resolve(`node_modules/.remotion/chrome-headless-shell/mac-${arch}/chrome-headless-shell-mac-${arch}/chrome-headless-shell`);await access(actual);
  browserPath=resolve(temp,'chrome-wrapper');await writeFile(browserPath,`#!${process.execPath}\nconst {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(actual)},process.argv.slice(2).map(a=>a==='--remote-debugging-port=0'?'--remote-debugging-port=${debugPort}':a),{stdio:'inherit'});c.on('exit',(code)=>process.exit(code??1));c.on('error',()=>process.exit(1));\n`);await chmod(browserPath,0o700);
 }
 const network=(operation==='render'||operation==='probe')?`(allow network-inbound (local ip "localhost:*"))(allow network-outbound (remote ip "localhost:${renderPort}") (remote ip "localhost:${debugPort}"))`:'';
 const profile=`(version 1)(allow default)(deny network*)(allow network* (local unix-socket) (remote unix-socket))${network}(deny file-write*)(allow file-write* (subpath ${JSON.stringify(root)}))(allow file-write* (literal "/dev/null"))(deny file-read* (regex #".*[/]\\.env.*"))(deny file-read* (subpath ${JSON.stringify(resolve(process.env.HOME??'/nonexistent','.ssh'))}))`;
 return new Promise<string>((res,rej)=>{
  const child=spawn('/usr/bin/sandbox-exec',['-p',profile,process.execPath,'--max-old-space-size=1024','--import','tsx',resolve('apps/local-runner/director/tool-child.ts'),operation,root,JSON.stringify(args)],{detached:true,env:{PATH:process.env.PATH,HOME:shortTemp,TMPDIR:shortTemp,NODE_ENV:'production',CHROME_PATH:browserPath,DIRECTOR_RENDER_PORT:String(renderPort)},stdio:['ignore','pipe','pipe']});
  let out='',error='',finished=false,lines='';let progress=Promise.resolve(),progressError:unknown;
  const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{error='RENDER_TIME_LIMIT';kill();},Math.max(1,Math.min(limits.renderMs,runtimeLimitMs)));
  const monitor=setInterval(async()=>{if(finished||!child.pid)return;try{const {stdout}=await exec('/bin/ps',['-axo','pid,ppid,rss']);const rows=stdout.trim().split('\n').slice(1).map(l=>l.trim().split(/\s+/).map(Number)),pids=new Set([child.pid]);let changed=true;while(changed){changed=false;for(const [pid,ppid]of rows)if(pids.has(ppid)&&!pids.has(pid)){pids.add(pid);changed=true;}}const rss=rows.filter(([pid])=>pids.has(pid)).reduce((s,r)=>s+r[2],0);if(rss>limits.memoryMb*1024){error='RENDER_MEMORY_LIMIT';kill();}}catch{error='RENDER_MEMORY_MONITOR_UNAVAILABLE';kill();}},1000);
  child.stdout.on('data',b=>{out+=b;lines+=b;let newline;while((newline=lines.indexOf('\n'))>=0){const line=lines.slice(0,newline);lines=lines.slice(newline+1);if(onStill&&line.startsWith('DIRECTOR_STILL:'))progress=progress.then(()=>{if(!progressError)return onStill(JSON.parse(line.slice('DIRECTOR_STILL:'.length)));}).catch(e=>{progressError=e;kill();});}if(out.length>2*1024*1024){error='TOOL_OUTPUT_LIMIT';kill();}});child.stderr.on('data',b=>{error=(error+b).slice(-12000);});
  child.on('error',rej);child.on('close',async code=>{void rm(shortTemp,{force:true});finished=true;clearTimeout(timer);clearInterval(monitor);kill();await progress;if(progressError){rej(progressError);return;}if(code===0)res(out);else rej(new Error(error||out.slice(-12000)||`TOOL_EXIT_${code}`));});
 });
}
