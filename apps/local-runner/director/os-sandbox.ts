// The OS sandbox for agent-written code (bundle, typecheck, render, preview, inspect). macOS uses sandbox-exec; Linux
// (also Windows through WSL) uses bubblewrap with the same guarantees: no network beyond the sandbox's own loopback,
// writes only inside the work folder, no access to .env files or the home folder (keys, SSH, Claude sign-in), a
// minimal environment, and the whole process tree ends with the sandbox. Any other platform fails closed.
import {execFile} from 'node:child_process';
import {access,constants,readdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {promisify} from 'node:util';
const exec=promisify(execFile);

export const BWRAP='/usr/bin/bwrap';

/** Where the renderer's Chrome Headless Shell lives (Remotion's ensureBrowser download). No renderer import here: Next.js
 * routes import this module through sandbox.ts, and bundling @remotion/renderer there fails on Linux. */
export function headlessShellPath(env:Record<string,string|undefined>=process.env,platform=process.platform,arch=process.arch){
 if(env.DIRECTOR_CHROME_PATH)return env.DIRECTOR_CHROME_PATH;
 // Remotion's folder names: mac-x64 / mac-arm64 and linux64 / linux-arm64.
 const folder=platform==='darwin'?`mac-${arch==='arm64'?'arm64':'x64'}`:arch==='arm64'?'linux-arm64':'linux64';
 return resolve(`node_modules/.remotion/chrome-headless-shell/${folder}/chrome-headless-shell-${folder}/chrome-headless-shell`);
}

export type SandboxPlatform='darwin'|'linux';
export const sandboxPlatform=(platform=process.platform):SandboxPlatform|null=>platform==='darwin'||platform==='linux'?platform:null;

/** Fails with a plain reason when this computer cannot isolate agent code. Linux probes a real sandbox once. */
export async function ensureOsSandbox(platform=process.platform){
 if(platform==='darwin'){await access('/usr/bin/sandbox-exec',constants.X_OK);return;}
 if(platform==='linux'){
  try{await access(BWRAP,constants.X_OK);}catch{throw new Error('bubblewrap is not installed. In Ubuntu (WSL): sudo apt-get install -y bubblewrap');}
  try{await exec(BWRAP,['--unshare-all','--die-with-parent','--ro-bind','/','/','--dev','/dev','--proc','/proc','true'],{timeout:15000});}
  catch(error){throw new Error(`bubblewrap cannot create a sandbox here (${error instanceof Error?error.message.split('\n')[0].slice(0,160):'unknown'}). Unprivileged user namespaces must be allowed.`);}
  return;
 }
 throw new Error('DIRECTOR_OS_SANDBOX_UNAVAILABLE');
}

/** .env files next to the code: hidden inside the sandbox like on macOS. */
export async function envFiles(repo:string){return (await readdir(repo).catch(()=>[] as string[])).filter(f=>/^\.env/.test(f)).map(f=>resolve(repo,f));}

/**
 * bubblewrap arguments. The root file system is read-only; the home folder is replaced by an empty one (the code and
 * Node are mounted back read-only when they live there); .env files cannot be read; only `root` is writable. All
 * namespaces are new, so the network is the sandbox's own loopback only (the renderer and its browser talk inside it).
 */
export function linuxSandboxArgs(args:{root:string;repo:string;execPath:string;home:string;hidden:string[];env:Record<string,string|undefined>;command:string[]}){
 const out=['--die-with-parent','--new-session','--unshare-all','--ro-bind','/','/','--dev','/dev','--tmpfs','/dev/shm','--proc','/proc','--tmpfs','/tmp'];
 if(args.home&&args.home!=='/')out.push('--tmpfs',args.home);
 for(const path of [args.repo,dirname(args.execPath)])if(args.home&&path.startsWith(args.home+'/'))out.push('--ro-bind',path,path);
 for(const file of args.hidden)out.push('--ro-bind','/dev/null',file);
 out.push('--bind',args.root,args.root,'--clearenv');
 for(const [k,v] of Object.entries(args.env))if(v!==undefined)out.push('--setenv',k,v);
 out.push('--chdir',args.repo,'--',...args.command);
 return out;
}
