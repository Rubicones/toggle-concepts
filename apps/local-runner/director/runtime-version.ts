import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const runtimePackages=['react','react-dom','remotion','gsap','three','@remotion/renderer','@remotion/bundler','@remotion/media','@remotion/three','@react-three/fiber','@remotion/transitions','@remotion/paths','@remotion/shapes','@remotion/noise','@remotion/lottie','@remotion/media-utils','@remotion/layout-utils'];
export async function runtimeVersions(){return Object.fromEntries(await Promise.all(runtimePackages.map(async name=>[name,JSON.parse(await readFile(resolve('node_modules',name,'package.json'),'utf8')).version])));}
export async function requireRuntimeVersion(folder:string){const expected=JSON.parse(await readFile(resolve(folder,'toolchain.json'),'utf8')),actual=await runtimeVersions();if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('COMPOSITION_TOOLCHAIN_VERSION_CHANGED');}
