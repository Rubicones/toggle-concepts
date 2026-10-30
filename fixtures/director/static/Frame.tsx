import React from 'react';
import {AbsoluteFill,Img,staticFile,useVideoConfig} from 'remotion';
import {brand,copy,variants,variantFacts} from './brand';
export default function Frame({format,locale,hook,cta,length,sceneId}:{format:string;locale:string;hook:string;cta:string;length:number;sceneId:string;moment:string}){
 const {width,height}=useVideoConfig(),wide=format==='wide',vertical=format==='vertical';
 const variant=variants.find(v=>v.format===format&&v.locale===locale&&v.hook===hook&&v.cta===cta&&v.length===length)!;
 const facts=variantFacts[variant.id],scene=['scene-1','scene-2','scene-3','scene-4'].indexOf(sceneId),keys=['hook','version','comment','close'] as const;
 const title=facts?.sceneCopy[sceneId]??[(copy[keys[Math.max(0,scene)]] as Record<string,string>)[locale]],closing=scene===3;
 const left=wide?132:90,top=vertical?240:90,textWidth=width-left*2,fontSize=wide?70:54;
 return <AbsoluteFill style={{background:'#070707',color:'#F8F8F8',fontFamily:'Noto Sans'}}>
 <div style={{position:'absolute',left,top,width:textWidth,fontSize,lineHeight:1.18}}>{title.map(line=><p key={line} style={{margin:'0 0 20px'}}>{line}</p>)}</div>
 {closing?<>
 <div style={{position:'absolute',left,top:top+220,padding:24,background:'#F8F8F8'}}><Img data-brand-logo={brand.logos[0].id} src={staticFile(brand.logos[0].url)} style={{width:360,height:60,objectFit:'contain'}}/></div>
 <div style={{position:'absolute',left,top:top+390,width:textWidth,fontSize:40,lineHeight:1.3}}>{copy.offer[locale as keyof typeof copy.offer]}</div>
 <div style={{position:'absolute',left,top:top+530,padding:'18px 36px',background:'#DFFF00',color:'#070707',fontSize:44}}>{copy.cta[locale as keyof typeof copy.cta]}</div>
 </>:<div style={{position:'absolute',left:wide?left+650:left,top:top+(wide?210:280),width:wide?900:width-left*2,height:Math.min(height-top-400,360),border:'2px solid #777',borderRadius:24,background:'#161616',padding:36,display:'flex',gap:8,alignItems:'center'}}>{Array.from({length:28},(_,i)=><div key={i} style={{flex:1,height:40+Math.abs(Math.sin(i*.8))*100,background:i<10?'#DFFF00':'#F8F8F8',borderRadius:6}}/>)}</div>}
 </AbsoluteFill>;
}
