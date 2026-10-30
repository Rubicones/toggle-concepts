'use client';
import Image from 'next/image';
import {useEffect,useState} from 'react';
import {observeStudioRead} from '@/lib/studio-read';
import {studioRequest} from '@/lib/shared-http';
import type {DeliveryView} from '@/packages/creative/delivery';
export function CreativeDelivery({campaignId,direction,revision,dirty}:{campaignId:string;direction:number;revision:number;dirty:boolean}){
 const [loaded,setDelivery]=useState<{revision:number;value:DeliveryView}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),delivery=loaded?.revision===revision?loaded.value:null;
 useEffect(()=>{let active=true,working=false;const path=`/api/studio/campaigns/${campaignId}/creative/delivery?direction=${direction}`;
  const observer=observeStudioRead(path,async signal=>{try{const result=await studioRequest<DeliveryView>(path,'GET',undefined,{signal});if(active){setDelivery({revision,value:result});setError('');working=result.state==='pending'||result.state==='rendering';}}catch(e){if(active)setError(e instanceof Error?e.message:'Draft files are unavailable.');}},{active:()=>working});
  return()=>{active=false;observer.close();};
 },[campaignId,direction,revision,attempt]);
 if(dirty)return <p>Save this edit to prepare its draft MP4 and contact strip.</p>;
 if(!delivery||delivery.state!=='ready')return <div><p role="status">{error||(delivery?.state==='failed'?'Draft delivery needs attention.':`Draft files · ${delivery?.state??'loading'}…`)}</p>{delivery?.state==='failed'&&<button onClick={async()=>{try{await studioRequest(`/api/studio/campaigns/${campaignId}/creative/delivery`,'POST',{direction});setDelivery(null);setAttempt(n=>n+1);}catch(e){setError(e instanceof Error?e.message:'Draft rendering needs a saved revision.');}}}>Retry draft files · free</button>}</div>;
 return <aside aria-label="Saved draft files"><h4>Draft files · reference variant</h4><video controls preload="metadata" src={delivery.mp4Url} style={{width:'100%',maxHeight:400}}/><p><a href={delivery.mp4Url} download>Download draft MP4</a> · <a href={delivery.contactStripUrl} target="_blank" rel="noreferrer">Open contact strip</a></p><Image unoptimized src={delivery.contactStripUrl!} alt="Storyboard contact strip for the saved draft" width={1280} height={720} style={{width:'100%',height:'auto'}}/></aside>;
}
