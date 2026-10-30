import {access,constants} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Where sandbox.ts expects Chrome Headless Shell (installed by Remotion's ensureBrowser). */
export function headlessShellPath(){const arch=process.arch==='arm64'?'arm64':'x64';return process.env.DIRECTOR_CHROME_PATH??resolve(`node_modules/.remotion/chrome-headless-shell/mac-${arch}/chrome-headless-shell-mac-${arch}/chrome-headless-shell`);}
let ready:Promise<void>|null=null;
/**
 * Checked before any paid director request: renders need macOS sandbox-exec and Chrome Headless Shell. A missing
 * browser is downloaded once (free). Failure is reported in plain language instead of reaching the coding agent as a
 * tool error it cannot fix.
 */
export function ensureDirectorToolchain(){
 ready??=(async()=>{
  const fail=(detail:string)=>Object.assign(new Error('DIRECTOR_TOOLCHAIN_UNAVAILABLE'),{detail});
  if(process.platform!=='darwin')throw fail('Draft films render only on the studio Mac (macOS sandbox).');
  try{await access('/usr/bin/sandbox-exec',constants.X_OK);}catch{throw fail('macOS sandbox-exec is not available on this Mac.');}
  try{await access(headlessShellPath(),constants.X_OK);}catch{
   try{const {ensureBrowser}=await import('@remotion/renderer');await ensureBrowser({chromeMode:'headless-shell'});await access(headlessShellPath(),constants.X_OK);}
   catch(error){throw fail(`The renderer browser could not be installed (${error instanceof Error?error.message.slice(0,200):'unknown error'}). Check the internet connection of the studio Mac and press Try again.`);}
  }
 })().catch(error=>{ready=null;throw error;});
 return ready;
}
