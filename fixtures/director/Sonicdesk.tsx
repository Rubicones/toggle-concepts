import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {copy,brand} from './brand';
import {useGsapTimeline,SplitText} from './runtime';
export default function Sonicdesk({locale,format}:{locale:string;format:string;hook:string;cta:string;length:number}){
 const lang=locale as keyof typeof copy.hook;
 const frame=useCurrentFrame(),{width:w,height:h,fps}=useVideoConfig(),t=frame/fps,wide=format==='wide',vertical=format==='vertical';
 const scope=useGsapTimeline(tl=>{const split=SplitText.create('.kinetic',{type:'words'});tl.fromTo(split.words,{y:24,rotationX:12},{y:0,rotationX:0,stagger:.06,duration:.35},0);return ()=>split.revert();});
 const x=wide?130:90,top=vertical?250:110,fs=wide?82:64;
 const camera=t<1.5?1.08+t*.09:1.08+(t-1.5)*.04;
 const scene=t<1.5?0:t<3.5?1:t<5?2:3;
 const textStyle:React.CSSProperties={fontSize:fs,fontFamily:'Noto Sans',fontWeight:400,lineHeight:1.12,margin:0};
 return <AbsoluteFill ref={scope} style={{background:'#070707',color:'#F8F8F8',fontFamily:'Noto Sans'}}>
  {scene===0?<><Img src={staticFile(`musician-${Math.min(2,Math.floor(t*2))}.png`)} style={{width:w,height:h,objectFit:'cover',transform:`scale(${camera}) translateX(${Math.sin(t*2)*12}px)`}}/><AbsoluteFill style={{background:'linear-gradient(0deg,#070707 12%,transparent 90%)'}}/></>:null}
  {(scene===1||scene===2)?<div style={{position:'absolute',inset:0,overflow:'hidden'}}>
   <div style={{position:'absolute',left:wide?350:100,top:top+220,width:wide?1350:880,height:600,transformOrigin:'68% 50%',transform:`scale(${scene===2?1.05+(t-3.5)*.20:1+(t-1.5)*.025}) translateX(${scene===2?-(t-3.5)*45:0}px)`,background:'#161616',border:'2px solid #777'}}>
    <div style={{position:'absolute',top:70,left:40,right:40,height:90,display:'flex',gap:8,alignItems:'center'}}>{Array.from({length:50},(_,i)=><div key={i} style={{flex:1,background:i<15+t*4?'#DFFF00':'#F8F8F8',height:20+50*Math.abs(Math.sin(i*.7)),borderRadius:8}}/>)}</div>
    <div style={{position:'absolute',left:'38%',top:260,padding:24,background:'#DFFF00',borderRadius:12,width:370,height:100}}><div style={{height:12,width:230,background:'#070707',marginBottom:20}}/><div style={{height:12,width:180,background:'#070707'}}/></div>
    <div style={{position:'absolute',left:`${40+(t*9)%500}px`,top:50,width:3,height:470,background:'#DFFF00'}}/>
   </div>
  </div>:null}
  <div style={{position:'absolute',left:x,top,width:wide?1500:w-x*2,padding:20,background:'#070707'}}>
   <p key={scene} className={scene===0?'kinetic':undefined} style={{...textStyle,fontSize:scene===3?52:fs}}>{scene===0?copy.hook[lang]:scene===1?copy.version[lang]:scene===2?copy.comment[lang]:copy.close[lang]}</p>
  </div>
  {scene===3?<>
   <div style={{position:'absolute',left:wide?1250:600,top:top+170,width:250,height:250}}>
    <ThreeCanvas width={250} height={250} camera={{position:[0,0,4],fov:38}} gl={{antialias:true,preserveDrawingBuffer:true}}><ambientLight intensity={1.2}/><directionalLight position={[3,3,5]} intensity={2}/><mesh rotation={[.3,t,.15]}><torusGeometry args={[.8,.16,12,40]}/><meshStandardMaterial color="#DFFF00" roughness={.3}/></mesh></ThreeCanvas>
   </div>
   <div style={{position:'absolute',left:x+20,top:top+200,padding:24,background:'#F8F8F8'}}><Img data-brand-logo={brand.logos[0].id} src={staticFile(brand.logos[0].url)} style={{width:400,height:65,objectFit:'contain'}}/></div>
   <div style={{position:'absolute',left:x+20,top:top+370,width:wide?1000:800,fontSize:42,lineHeight:1.25}}>{copy.offer[lang]}</div>
   <div style={{position:'absolute',left:x+20,top:top+560,padding:'22px 60px',background:'#DFFF00',color:'#070707',fontSize:52,transform:`scale(${1-.06*Math.exp(-(((t-5.55)/.15)**2))})`}}>{copy.cta[lang]}</div>
  </>:null}
 </AbsoluteFill>;
}
