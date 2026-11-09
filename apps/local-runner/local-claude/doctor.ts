// Local mode setup check (plan §13 S0, §16): `npm run local-claude:doctor`. It reads this device's state and says the
// one next step; with --fix it does what it safely can by itself: installs the Claude Code CLI, opens the sign-in in
// the browser, creates the device id and runs the capability check. It never reads or copies tokens, and it makes no
// model call except through `qualify`, which says so before it starts.
import {execFile,spawn} from 'node:child_process';
import {ensureDevice,readDevice,type Device} from './device';
import {profilePath,readProfile,type CapabilityProfile} from './qualify';
import {BILLING_VARIABLES,childEnv,type Env} from '../../../packages/agents/claude-cli.local';

export type DoctorStep={id:string;ok:boolean;detail:string;fix?:string};
export type Diagnosis={steps:DoctorStep[];next:string|null;ready:boolean};


const run=(bin:string,argv:string[],env:NodeJS.ProcessEnv)=>new Promise<{ok:boolean;out:string}>(done=>execFile(bin,argv,{env,timeout:30000},(error,out)=>done({ok:!error,out:String(out??'')})));

export function nodeSupported(version=process.versions.node){const [major,minor]=version.split('.').map(Number);return major===22&&(minor>13||(minor===13&&Number(version.split('.')[2])>=1));}

/** Reads the device's state without changing anything. */
export async function diagnose(options:{bin:string;env?:Env;device?:Device;profile?:CapabilityProfile;nodeVersion?:string}):Promise<Diagnosis>{
 const env:Env=options.env??process.env,steps:DoctorStep[]=[];
 const node=options.nodeVersion??process.versions.node;
 steps.push({id:'node',ok:nodeSupported(node),detail:`Node ${node}`,fix:'Install Node 22.13.1 or later 22.x (`nvm use` in the repository).'});
 const version=await run(options.bin,['--version'],childEnv(env));const cli=version.ok?version.out.trim().split(/\s+/)[0]:'';
 steps.push({id:'cli',ok:!!cli,detail:cli?`Claude Code ${cli}`:'Claude Code CLI not found',fix:'Run `npm run local-claude:doctor -- --fix`: it installs the CLI with npm.'});
 let auth:{loggedIn?:boolean;authMethod?:string;subscriptionType?:string}={};
 if(cli){const a=await run(options.bin,['auth','status','--json'],childEnv(env));try{auth=JSON.parse(a.out);}catch{/* not signed in */}}
 const subscription=!!auth.loggedIn&&!/api.?key|console/i.test(auth.authMethod??'');
 steps.push({id:'auth',ok:subscription,detail:auth.loggedIn?`signed in (${auth.authMethod??'unknown method'}${auth.subscriptionType?`, ${auth.subscriptionType}`:''})`:'not signed in',fix:'Run `npm run local-claude:doctor -- --fix`: it opens the Claude sign-in in your browser. Use your Claude subscription account, not an API key.'});
 const billing=BILLING_VARIABLES.filter(k=>env[k]);
 steps.push({id:'shell',ok:true,detail:billing.length?`your shell sets ${billing.join(', ')}; Local mode never passes them to Claude Code, so calls still use your subscription`:'no API keys or provider overrides in the shell'});
 steps.push({id:'device',ok:!!options.device,detail:options.device?`device "${options.device.label}" (${options.device.id.slice(0,8)})`:'this computer has no Local mode id yet',fix:'Run `npm run local-claude:doctor -- --fix`: it creates the id in ~/.toggle/device.json.'});
 const p=options.profile,fresh=!!p&&p.cli.version.split(/\s+/)[0]===cli&&p.device.id===options.device?.id;
 steps.push({id:'profile',ok:fresh&&p!.verdict.textRoles==='ready',detail:!p?'not qualified yet':!fresh?`qualified for ${p.cli.version} on another CLI version or device; check again`:`text roles ${p.verdict.textRoles}, visual roles ${p.verdict.visualRoles}${p.verdict.reasons.length?` (blocked by ${p.verdict.reasons.join('; ')})`:''}`,
  fix:p&&fresh?'The check found a blocker: read the profile, fix it and run `npm run local-claude:qualify` again.':'Run `npm run local-claude:qualify -- --extra-usage-off` once extra usage is off in your Claude settings. About ten short requests use your subscription.'});
 const first=steps.find(s=>!s.ok);
 return {steps,next:first?.fix??null,ready:!first};
}

/** Windows: the official native installer (claude.exe, found without a shell); elsewhere npm. */
function install(){return new Promise<boolean>(done=>{const c=process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command','irm https://claude.ai/install.ps1 | iex'],{stdio:'inherit'}):spawn('npm',['install','-g','@anthropic-ai/claude-code'],{stdio:'inherit'});c.once('close',code=>done(code===0));c.once('error',()=>done(false));});}
/** The sign-in is the CLI's own interactive flow in the person's browser; this tool never sees the token. */
function login(bin:string){return new Promise<boolean>(done=>{const c=spawn(bin,['auth','login'],{stdio:'inherit',env:childEnv(process.env)});c.once('close',code=>done(code===0));c.once('error',()=>done(false));});}

async function main(){
 const argv=process.argv.slice(2),flag=(name:string)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;},bin=flag('--bin')??'claude',fix=argv.includes('--fix');
 const print=(d:Diagnosis)=>{for(const s of d.steps)console.log(`${s.ok?'✓':'✗'} ${s.detail}`);console.log(d.ready?'\nLocal mode is ready on this device.':`\nNext: ${d.next}`);};
 let d=await diagnose({bin,device:await readDevice(),profile:await readProfile(profilePath())});
 if(!fix){print(d);process.exit(d.ready?0:1);}
 for(let round=0;round<5&&!d.ready;round++){
  const failing=d.steps.find(s=>!s.ok)!;
  if(failing.id==='node'){print(d);process.exit(1);}
  if(failing.id==='cli'){console.log('Installing Claude Code with npm…');if(!await install()){console.error('The install failed; see the npm output above.');process.exit(1);}}
  else if(failing.id==='auth'){console.log('Opening the Claude sign-in. Choose your Claude subscription account.');if(!await login(bin)){console.error('Sign-in did not finish.');process.exit(1);}}
  else if(failing.id==='device'){const {device}=await ensureDevice();console.log(`Created the device id for "${device.label}".`);}
  else if(failing.id==='profile'){
   if(!argv.includes('--extra-usage-off')){print(d);console.log('\nTurn off extra usage in your Claude account settings, then run:\n  npm run local-claude:doctor -- --fix --extra-usage-off');process.exit(1);}
   const code=await new Promise<number|null>(done=>{const c=spawn(process.execPath,['--import','tsx','apps/local-runner/local-claude/qualify.ts','--bin',bin,'--extra-usage-off',...(flag('--model')?['--model',flag('--model')!]:[])],{stdio:'inherit'});c.once('close',done);});
   if(code!==0&&code!==2){process.exit(1);}
  }
  d=await diagnose({bin,device:await readDevice(),profile:await readProfile(profilePath())});
  if(d.steps.find(s=>!s.ok)?.id===failing.id)break;
 }
 print(d);process.exit(d.ready?0:1);
}
if(process.argv[1]?.endsWith('doctor.ts'))void main();
