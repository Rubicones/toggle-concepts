import type {VideoConfig} from 'remotion';
import {RenderInternals,renderStill} from '@remotion/renderer';
// Pinned renderer internals preserve the exact Remotion readiness and capture semantics.
import {seekToFrame} from '../../../node_modules/@remotion/renderer/dist/seek-to-frame';
import {takeFrame} from '../../../node_modules/@remotion/renderer/dist/take-frame';
import type {openBrowser} from '@remotion/renderer';
import type {Sample} from '../../../packages/director/checks.local';
import {resolve} from 'node:path';
type Browser=Awaited<ReturnType<typeof openBrowser>>;
/** Re-seek a single mounted composition backwards; fresh mounts alone miss state leaks. */
export async function scrubFrames(browser:Browser,common:Parameters<typeof renderStill>[0],composition:VideoConfig,samples:Sample[]){
 if(!samples.length)return;
 const original=browser.newPage.bind(browser);let held:Awaited<ReturnType<Browser['newPage']>>|undefined,close:(()=>Promise<void>)|undefined;
 browser.newPage=async(...args)=>{const page=await original(...args);held=page;close=page.close.bind(page);page.close=async()=>{};return page;};
 try{await renderStill({...common,composition,frame:samples[0].evidence.frame,output:null,imageFormat:'png'});}finally{browser.newPage=original;}
 if(!held||!close)throw new Error('DETERMINISM_PAGE_REQUIRED');
 const server=await RenderInternals.prepareServer({webpackConfigOrServeUrl:common.serveUrl,port:common.port??null,remotionRoot:resolve('.'),offthreadVideoThreads:2,logLevel:'error',indent:false,offthreadVideoCacheSizeInBytes:null,binariesDirectory:null,forceIPv4:true,sampleRate:48000});
 try{for(const sample of [...samples].reverse()){
  await seekToFrame({page:held,frame:sample.evidence.frame,composition:composition.id,timeoutInMilliseconds:30000,logLevel:'error',indent:false,attempt:0});
  sample.repeat=(await takeFrame({freePage:held,imageFormat:'png',jpegQuality:undefined,width:composition.width,height:composition.height,output:null,scale:1,wantsBuffer:true,timeoutInMilliseconds:30000,remotionSharedMemory:null}))!;
 }}finally{await close();await server.closeServer(false);}
}
