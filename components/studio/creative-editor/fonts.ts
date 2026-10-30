import {TextEngine} from '@/packages/engine/engine/textengine';
import type {EditorWorkspace} from './model';
export async function bytesHash(bytes:ArrayBuffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function loadEditorFonts(fonts:EditorWorkspace['fonts'],signal:AbortSignal){
 const data=await Promise.all(fonts.map(async f=>{const response=await fetch(f.url,{signal});if(!response.ok)throw new Error(`Could not load ${f.role} font.`);const bytes=await response.arrayBuffer();if(await bytesHash(bytes)!==f.sha256)throw new Error('Verified font digest changed.');return {key:f.role,data:bytes};}));return TextEngine.create(data);
}
