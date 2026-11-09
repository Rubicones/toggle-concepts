// The Linux OS sandbox (bubblewrap) gives agent code the macOS guarantees: no outside network, writes only in the
// work folder, no .env files and no home folder (keys, SSH, Claude sign-in), a minimal environment. Runs where
// bubblewrap works; skipped elsewhere (macOS keeps sandbox-exec).
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {BWRAP,ensureOsSandbox,linuxSandboxArgs,sandboxPlatform} from '../apps/local-runner/director/os-sandbox';
import {headlessShellPath} from '../apps/local-runner/director/toolchain';
const exec=promisify(execFile);
const usable=process.platform==='linux'&&existsSync(BWRAP)&&(()=>{try{execFileSync(BWRAP,['--unshare-all','--ro-bind','/','/','--dev','/dev','--proc','/proc','true'],{timeout:15000});return true;}catch{return false;}})();

test('the browser paths follow Remotion on macOS and Linux; other systems have no sandbox', ()=>{
 assert.match(headlessShellPath({},'linux','x64'),/chrome-headless-shell\/linux64\/chrome-headless-shell-linux64\/chrome-headless-shell$/);
 assert.match(headlessShellPath({},'darwin','arm64'),/mac-arm64\/chrome-headless-shell-mac-arm64\/chrome-headless-shell$/);
 assert.equal(headlessShellPath({DIRECTOR_CHROME_PATH:'/x'}),'/x');
 assert.equal(sandboxPlatform('win32'),null);assert.equal(sandboxPlatform('linux'),'linux');
});

test('bubblewrap isolates agent code like the macOS profile', {skip:!usable&&'bubblewrap is not usable here'}, async()=>{
 await ensureOsSandbox();
 const base=await mkdtemp(join(tmpdir(),'sbx-')),home=join(base,'home'),repo=join(home,'repo'),root=join(repo,'work'),outside=join(repo,'outside.txt');
 await mkdir(root,{recursive:true});await mkdir(join(home,'.ssh'),{recursive:true});
 await writeFile(join(repo,'.env.local'),'OPENROUTER_API_KEY=secret');await writeFile(join(home,'.ssh','id'),'private');
 const script=`
  const fs=require('node:fs'),net=require('node:net'),out={};
  const tryIt=(k,f)=>{try{out[k]=f();}catch(e){out[k]='DENIED:'+e.code;}};
  tryIt('env',()=>fs.readFileSync(${JSON.stringify(join(repo,'.env.local'))},'utf8'));
  tryIt('ssh',()=>fs.readFileSync(${JSON.stringify(join(home,'.ssh','id'))},'utf8'));
  tryIt('writeOutside',()=>{fs.writeFileSync(${JSON.stringify(outside)},'x');return 'WROTE';});
  tryIt('writeRoot',()=>{fs.writeFileSync(${JSON.stringify(join(root,'ok.txt'))},'x');return 'WROTE';});
  out.key=process.env.OPENROUTER_API_KEY??null;
  const server=net.createServer(s=>s.end('hi')).listen(0,'127.0.0.1',()=>{
   const c=net.connect(server.address().port,'127.0.0.1');c.on('data',d=>{out.loopback=String(d);
    const o=net.connect(443,'1.1.1.1');o.setTimeout(3000);o.on('connect',()=>{out.outside='CONNECTED';done();});o.on('error',e=>{out.outside='DENIED:'+e.code;done();});o.on('timeout',()=>{out.outside='DENIED:TIMEOUT';done();});});});
  function done(){console.log(JSON.stringify(out));process.exit(0);}`;
 const args=linuxSandboxArgs({root,repo,execPath:process.execPath,home,hidden:[join(repo,'.env.local')],env:{PATH:process.env.PATH,HOME:'/tmp',TMPDIR:'/tmp'},command:[process.execPath,'-e',script]});
 const {stdout}=await exec(BWRAP,args,{env:{PATH:process.env.PATH,OPENROUTER_API_KEY:'secret'},timeout:30000});
 const r=JSON.parse(stdout.trim().split('\n').at(-1)!);
 assert.ok(!String(r.env).includes('secret'),'.env files cannot be read (like the macOS deny rule)');
 assert.match(r.ssh,/^DENIED:/,'the real home folder is hidden');
 assert.match(r.writeOutside,/^DENIED:/);assert.equal(r.writeRoot,'WROTE');
 assert.equal(r.key,null,'no keys in the environment');
 assert.equal(r.loopback,'hi','the sandbox keeps its own loopback for the renderer');
 assert.match(r.outside,/^DENIED:/,'no outside network');
 assert.equal(await readFile(join(root,'ok.txt'),'utf8'),'x');assert.equal(existsSync(outside),false);
});
