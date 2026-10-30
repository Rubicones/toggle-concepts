// Trusted browser bridge; only Frame and its authored imports are untrusted.
import React,{Component,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
// @ts-expect-error Resolved to this workspace's confined Frame.tsx by the sandboxed bundler.
import Frame from 'director-frame';
// @ts-expect-error Trusted virtual data module, never a generated-file read by the coder.
import {brand,resources} from 'director-brand';
import type {LiveFrameProps} from '../../../packages/director/live-preview';
import {replaceLiveRecord} from '../../../packages/director/live-assets';
type Settings={token:string;props:LiveFrameProps;assets:Record<string,string>;resources:Record<string,unknown>;reviewKey:string};
const runtime=window as unknown as {__DIRECTOR_PREVIEW__:Settings;remotion_staticFiles:{name:string;src:string}[]};
const settings=runtime.__DIRECTOR_PREVIEW__,notify=(type:string,message?:string,reviewKey='',sequence=0)=>parent.postMessage({type,token:settings.token,message,reviewKey,sequence},'*');
const loadedFonts=new Set<string>();
async function loadFonts(){await Promise.all(brand.fonts.map(async(f:{family:string;url:string;weight?:string;style?:string})=>{const src=settings.assets[f.url];if(!src||loadedFonts.has(src))return;const face=new FontFace(f.family,`url(${src})`,{weight:String(f.weight??400),style:f.style??'normal'});await face.load();document.fonts.add(face);loadedFonts.add(src);}));}
class Boundary extends Component<{children:React.ReactNode;reviewKey:string;sequence:number},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(error:Error){notify('preview-error',error.message.slice(0,400),this.props.reviewKey,this.props.sequence);}render(){return this.state.failed?<p style={{fontFamily:'sans-serif',padding:24}}>This option is still being built.</p>:this.props.children;}}
function App(){
 const [view,setView]=useState({props:settings.props,assetsVersion:0,reviewKey:settings.reviewKey,sequence:0,pending:false});
 useEffect(()=>{let lastSequence=0,assetsEpoch=0,currentKey=settings.reviewKey;const receive=(event:MessageEvent)=>{
  if(event.source!==parent||event.data?.token!==settings.token||event.data.type!=='preview-view')return;
  const next=event.data,p=next.props;if(!Number.isInteger(next.sequence)||next.sequence<=lastSequence||!p||!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<200||p.width>2400||p.height<200||p.height>2400)return;
  lastSequence=next.sequence;currentKey=typeof next.reviewKey==='string'?next.reviewKey:'';
  if(next.assets){replaceLiveRecord(settings.assets,next.assets);runtime.remotion_staticFiles=Object.entries(settings.assets).map(([name,src])=>({name,src}));replaceLiveRecord(resources,next.resources??{});}
  setView(old=>({...old,props:p,sequence:next.sequence,reviewKey:currentKey,pending:next.assets?true:old.pending,assetsVersion:old.assetsVersion+(next.assets?1:0)}));
  if(next.assets){const epoch=++assetsEpoch;void loadFonts().catch(()=>{if(epoch===assetsEpoch)notify('preview-error','A supplied font could not load.',currentKey,lastSequence);}).finally(()=>{if(epoch===assetsEpoch)setView(old=>({...old,pending:false,assetsVersion:old.assetsVersion+1}));});}
 };window.addEventListener('message',receive);notify('preview-ready');return()=>window.removeEventListener('message',receive);},[]);
 useEffect(()=>{if(!view.pending)notify('preview-view-ready',undefined,view.reviewKey,view.sequence);},[view.pending,view.reviewKey,view.sequence,view.assetsVersion]);
 const {props,assetsVersion}=view;
 return <Boundary reviewKey={view.reviewKey} sequence={view.sequence} key={`${props.locale}:${props.hook}:${props.cta}:${props.length}:${props.sceneId}:${props.moment}:${props.width}:${props.height}:${assetsVersion}`}><Player component={Frame} inputProps={{...props,assetVersion:assetsVersion}} compositionWidth={props.width} compositionHeight={props.height} durationInFrames={1} fps={30} controls={false} autoPlay={false} loop={false} clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause={false} style={{width:'100%',height:'100%'}}/></Boundary>;
}
Object.assign(resources,settings.resources);
void loadFonts().catch(()=>notify('preview-error','A supplied font could not load.')).finally(()=>createRoot(document.getElementById('root')!).render(<App/>));
