import {access,constants} from 'node:fs/promises';
import {ensureOsSandbox,sandboxPlatform,headlessShellPath} from './os-sandbox';
/** Where sandbox.ts expects Chrome Headless Shell (installed by Remotion's ensureBrowser). */
/** Kept in os-sandbox.ts (no renderer import), so routes that only need the path never bundle @remotion/renderer. */
export {headlessShellPath};
let ready:Promise<void>|null=null;
/**
 * Checked before any paid director request: renders need the OS sandbox (macOS sandbox-exec or Linux bubblewrap) and Chrome Headless Shell. A missing
 * browser is downloaded once (free). Failure is reported in plain language instead of reaching the coding agent as a
 * tool error it cannot fix.
 */
export function ensureDirectorToolchain(){
 ready??=(async()=>{
  const fail=(detail:string)=>Object.assign(new Error('DIRECTOR_TOOLCHAIN_UNAVAILABLE'),{detail});
  if(!sandboxPlatform())throw fail('Draft films render on macOS or Linux (on Windows: inside WSL), where agent code runs in an OS sandbox.');
  try{await ensureOsSandbox();}catch(error){throw fail(process.platform==='darwin'?'macOS sandbox-exec is not available on this Mac.':error instanceof Error?error.message:'The OS sandbox is not available.');}
  try{await access(headlessShellPath(),constants.X_OK);}catch{
   try{const {ensureBrowser}=await import('@remotion/renderer');await ensureBrowser({chromeMode:'headless-shell'});await access(headlessShellPath(),constants.X_OK);}
   catch(error){throw fail(`The renderer browser could not be installed (${error instanceof Error?error.message.slice(0,200):'unknown error'}). Check the internet connection of the studio Mac and press Try again.`);}
  }
 })().catch(error=>{ready=null;throw error;});
 return ready;
}
