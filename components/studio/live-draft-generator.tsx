'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {readStudioResponse} from '@/packages/contracts/studio-response';
import {observeStudioRead} from '@/lib/studio-read';
import type {LivePreview,LiveFrameProps} from '@/packages/director/live-preview';
import {liveAspectPresets,liveFormat,liveSelection,readyLiveVariants,livePreviewDocument,reconcileLiveSelection} from '@/packages/director/live-preview';
import {loadLiveAssets,availableLiveResources,LIVE_ASSET_BYTES,type CachedLiveAsset} from '@/packages/director/live-assets';
import {makeReviewTarget,reviewKey,type ReviewTarget} from '@/packages/director/review';
import {LiveViewReview} from './live-view-review';
import styles from './live-draft-generator.module.css';
export function LiveDraftGenerator({endpoint,directionId,iterationId,working=false,busy=false,command}:{endpoint:string;directionId:string;iterationId?:string;working?:boolean;busy?:boolean;command?:(body:Record<string,unknown>)=>Promise<boolean>}){
 const base=`${endpoint}/preview?direction=${encodeURIComponent(directionId)}${iterationId?`&iteration=${encodeURIComponent(iterationId)}`:''}`;
 const [preview,setPreview]=useState<LivePreview>({status:'waiting'}),[selected,setSelected]=useState<LiveFrameProps|null>(null),[document,setDocument]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [loadError,setLoadError]=useState(''),[reload,setReload]=useState(0);
 const frame=useRef<HTMLIFrameElement>(null),selection=useRef<LiveFrameProps|null>(null),channel=useRef(''),revision=useRef(''),assetRevision=useRef(''),maps=useRef<Record<string,string>>({}),resources=useRef<LivePreview['resources']>({});
 const [target,setTarget]=useState<ReviewTarget|null>(null),[acknowledged,setAcknowledged]=useState(false);
 const displayed=useRef<LivePreview>({status:'waiting'}),targetRef=useRef<ReviewTarget|null>(null),sequence=useRef(0),sentKey=useRef('');
 const publishView=useCallback((withAssets=false)=>{const props=selection.current;if(!props)return;const meta=displayed.current,identity=meta.review?.identity;
  const next=identity?makeReviewTarget(identity,props,(meta.assets??[]).filter(a=>!maps.current[a.name]).map(a=>a.name)):null,key=next?reviewKey(next):JSON.stringify(props);
  if(!withAssets&&sentKey.current===key)return;sentKey.current=key;targetRef.current=next;setTarget(next);setAcknowledged(false);setError('');
  frame.current?.contentWindow?.postMessage({type:'preview-view',token:channel.current,sequence:++sequence.current,reviewKey:next?key:'',props,...(withAssets?{assets:maps.current,resources:resources.current}:{})},'*');
 },[]);
 const activeWork=useRef(working);
 useEffect(()=>{activeWork.current=working;},[working]);
 const choose=(value:LiveFrameProps)=>{selection.current=value;setSelected(value);publishView();};
 useEffect(()=>{
  let closed=false,assetRetries=0;const abort=new AbortController(),cache=new Map<string,CachedLiveAsset>();revision.current='';assetRevision.current='';sentKey.current='';
  const request=async<T,>(url:string):Promise<T>=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(45000)])});return readStudioResponse<T>(r);};
  const update=async()=>{if(closed)return;try{
   const next=await request<LivePreview>(base);if(closed)return;setLoadError('');setNotice(next.message??'');
   if(!next.revision){setPreview(old=>old.revision?old:next);return;}
   const changedAssets=next.assetRevision!==assetRevision.current;
   let available=maps.current,missing:string[]=[];
   const assetTask=changedAssets?loadLiveAssets({files:next.assets??[],cache,read:async asset=>{
    const r=await fetch(`${base}&kind=asset&name=${encodeURIComponent(asset.name)}`,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(!r.ok)throw new Error('Asset pending');const blob=await r.blob();if(blob.size>LIVE_ASSET_BYTES)throw new Error('Asset too large');
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});return {data,bytes:blob.size};
   },onChange:assets=>{available=assets;if(closed||revision.current!==next.revision)return;displayed.current=next;maps.current=assets;resources.current=availableLiveResources(next.resources,assets);publishView(true);}}):null;
   const freshSource=revision.current!==next.revision,bundle=freshSource?await request<{script:string;css:string}>(`${base}&kind=bundle&revision=${next.revision}`):null;if(closed)return;
   let current=selection.current??next.defaultProps!;const options=next.options!;current=reconcileLiveSelection(next.variants??[],options,current,{...next.defaultProps!,width:current.width,height:current.height,format:liveFormat(current.width,current.height)});
   if(!options.adaptive&&!next.legacy)current={...current,width:1080,height:1080,format:'square'};
   selection.current=current;setSelected(current);setPreview(next);displayed.current=next;maps.current=available;resources.current=availableLiveResources(next.resources,available);
   if(bundle){channel.current=crypto.randomUUID();revision.current=next.revision!;sentKey.current='';publishView();setDocument(livePreviewDocument({...bundle,token:channel.current,props:current,assets:available,resources:resources.current,reviewKey:targetRef.current?reviewKey(targetRef.current):''}));}
   else publishView();
   if(assetTask){const loaded=await assetTask;if(closed)return;missing=loaded.missing;maps.current=loaded.assets;resources.current=availableLiveResources(next.resources,loaded.assets);}
   if(!missing.length){assetRevision.current=next.assetRevision??'';assetRetries=0;}else{
    setNotice('A supplied picture or font is still loading; the preview will update when it arrives.');
    if(assetRetries<3)observer.retry(2000*++assetRetries);
    else setLoadError('A picture or font could not be loaded. Retry the preview to check it again.');
   }
  }catch(e){if(!closed){const message=e instanceof Error&&e.name==='TimeoutError'?'Preview loading took too long. Retry to reopen the saved source.':e instanceof Error?e.message:'The preview could not be loaded.';setLoadError(message);setNotice(message);}}};
  const observer=observeStudioRead(base,update,{live:!iterationId,active:()=>activeWork.current});
  return()=>{closed=true;abort.abort();observer.close();};
 },[base,iterationId,publishView,reload]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.data?.token!==channel.current)return;
  if(event.data.type==='preview-ready'){sentKey.current='';publishView(true);return;}
  const key=targetRef.current?reviewKey(targetRef.current):'';if(event.data.sequence!==sequence.current||event.data.reviewKey!==key)return;
  if(event.data.type==='preview-view-ready')setAcknowledged(true);
  if(event.data.type==='preview-error')setError('This option is still being built. You can keep exploring the other controls.');
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[publishView]);
 const options=preview.options,readyVariants=options?readyLiveVariants(preview.variants??[],options):[],scene=preview.scenes?.find(s=>s.sceneId===selected?.sceneId);
 const dimensions=(width:number,height:number)=>{if(selected)choose({...selected,width,height,format:liveFormat(width,height)});};
 return <div className={styles.previewContainer}>{loadError&&<div className={styles.error} role="alert"><p>{loadError}</p><Button type="button" variant="outline" onClick={()=>{setLoadError('');setReload(value=>value+1);}}>Retry preview</Button></div>}<section className={styles.generator} aria-label="Live Frame.tsx generator"><aside className={styles.controls}><span className={styles.eyebrow}>{iterationId?'Saved draft':'Live draft'}</span><h4 className={styles.title}>{iterationId?'Explore this version.':'Explore this direction.'}</h4><p className={styles.status}>{iterationId?'Browse the saved Frame.tsx. Switching controls is immediate and free.':working?'The coder is working. New options, images and layout changes appear here.':'Browse the current Frame.tsx. Switching controls is immediate and free.'}</p>
 {selected&&options?<><OptionGroup label="Hook" values={options.hooks.filter(value=>readyVariants.some(v=>v.hook===value))} active={selected.hook} onChange={value=>choose(liveSelection(readyVariants,selected,'hook',value))} format={value=>options.labels?.hooks?.[String(value)]??(value==='primary'?'Main hook':String(value).replace('hook-','Hook '))}/><OptionGroup label="Scene" values={options.scenes} active={selected.sceneId} onChange={value=>choose({...selected,sceneId:value,moment:preview.scenes?.find(s=>s.sceneId===value)?.moments[0]?.id??'key-frame'})} format={value=>options.labels?.scenes?.[String(value)]??`Scene ${(preview.scenes?.findIndex(s=>s.sceneId===value)??0)+1}`}/><OptionGroup label="Language" values={options.locales.filter(value=>readyVariants.some(v=>v.locale===value))} active={selected.locale} onChange={value=>choose(liveSelection(readyVariants,selected,'locale',value))} format={value=>new Intl.DisplayNames(['en'],{type:'language'}).of(String(value))??String(value)}/><OptionGroup label="CTA" values={options.ctas.filter(value=>readyVariants.some(v=>v.cta===value))} active={selected.cta} onChange={value=>choose(liveSelection(readyVariants,selected,'cta',value))} format={value=>options.labels?.ctas?.[String(value)]??(value==='primary'?'Main CTA':String(value))}/><OptionGroup label="Length" values={options.lengths.filter(value=>readyVariants.some(v=>v.length===value))} active={selected.length} onChange={value=>choose(liveSelection(readyVariants,selected,'length',value))} format={value=>`${value}s`}/>
 {scene&&scene.moments.length>1&&<OptionGroup label="Moment" values={scene.moments.map(m=>m.id)} active={selected.moment} onChange={value=>choose({...selected,moment:value})} format={value=>scene.moments.find(m=>m.id===value)?.description??String(value)}/>}
 <div className={styles.group}><label className={styles.label} htmlFor={`ratio-${directionId}-${iterationId??'work'}`}>Aspect ratio · {selected.width} × {selected.height}</label><div className={styles.pills}>{(options.adaptive?liveAspectPresets:[{label:preview.legacy?(liveAspectPresets.find(p=>Math.abs(p.width/p.height-selected.width/selected.height)<.01)?.label??'Saved aspect'):'1:1',width:selected.width,height:selected.height}]).map(p=><button type="button" key={p.label} className={styles.pill} disabled={!options.adaptive} aria-pressed={Math.abs(selected.width/selected.height-p.width/p.height)<.01} onClick={()=>dimensions(p.width,p.height)}>{p.label}</button>)}</div>{options.adaptive&&<input id={`ratio-${directionId}-${iterationId??'work'}`} className={styles.range} type="range" min={.5625} max={1.7778} step={.005} value={Math.max(.5625,Math.min(1.7778,selected.width/selected.height))} disabled={!options.adaptive} onChange={e=>dimensions(1080,Math.round(1080/Number(e.target.value)))}/> }{!options.adaptive&&<p className={styles.notes}>{preview.legacy?'This saved component keeps its authored sizing. Continuous adaptation appears when the coder updates it.':'Square is ready. Adaptive sizing appears when the coder publishes it.'}</p>}</div></>:<p className={styles.empty}>{iterationId?'Loading the saved scene and copy controls…':'The first square preview will appear as soon as Frame.tsx builds. Completed options will appear on this side.'}</p>}
 <LiveViewReview preview={preview} target={acknowledged?target:null} busy={busy} command={command}/> </aside><div className={styles.stage}><div className={styles.viewport}>{document&&selected?<div className={styles.frame} style={{aspectRatio:`${selected.width}/${selected.height}`,maxWidth:`${620*selected.width/selected.height}px`}}><iframe ref={frame} className={styles.iframe} title="Current adaptive Frame.tsx preview" sandbox="allow-scripts" srcDoc={document}/></div>:<p className={styles.empty}>{iterationId?(loadError?'The saved preview could not be loaded. Your saved source is unchanged.':'Loading this saved component…'):'A live component preview will appear here. There is no image-render queue.'}</p>}</div>{error&&<p role="status" className={styles.error}>{error}</p>}<div className={styles.caption}><strong>Live component · work in progress</strong>{!iterationId&&preview.construction&&<p>{({square:"Building the square composition.",adaptation:"Square source saved. Adaptive sizing remains.",options:"Adding the remaining options.",complete:"Source checks complete. Ready for your review."})[preview.construction.stage]}</p>}<p>{notice||'One adaptive component. Control changes run in your browser without a model call or an image export.'}</p>{Object.values(preview.resources??{}).filter(r=>r.proxy&&r.sceneId===selected?.sceneId).map(r=><p key={r.id}>Still proxy for planned {r.proxyFor==='3d'?'3D':'video'}.</p>)}{preview.legacy&&<p>This saved component predates option readiness declarations. Its existing adaptive behavior is shown as authored.</p>}</div></div></section></div>;
}

function OptionGroup({label,values,active,onChange,format=String}:{label:string;values:(string|number)[];active:string|number;onChange:(value:string)=>void;format?:(value:string|number)=>string}){return <div className={styles.group}><span className={styles.label}>{label}</span><div className={styles.pills}>{values.length===1?<span className={`${styles.pill} ${styles.current}`}>{format(values[0])}</span>:values.map(value=><button type="button" className={styles.pill} key={value} aria-pressed={active===value} onClick={()=>onChange(String(value))}>{format(value)}</button>)}</div></div>;}
