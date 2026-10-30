import {useLayoutEffect, useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {gsap} from 'gsap';
import {SplitText} from 'gsap/SplitText';
import {MorphSVGPlugin} from 'gsap/MorphSVGPlugin';
import {DrawSVGPlugin} from 'gsap/DrawSVGPlugin';
import {MotionPathPlugin} from 'gsap/MotionPathPlugin';
import {CustomEase} from 'gsap/CustomEase';
import {Flip} from 'gsap/dist/Flip';
gsap.registerPlugin(SplitText,MorphSVGPlugin,DrawSVGPlugin,MotionPathPlugin,CustomEase,Flip);
gsap.ticker.sleep();
/** Rebuild from the same DOM baseline and seek, including backwards and frame zero. */
export function useGsapTimeline(build:(timeline:gsap.core.Timeline)=>(()=>void)|void){
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),scope=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const context=gsap.context(()=>{const timeline=gsap.timeline({paused:true});const cleanup=build(timeline);timeline.pause().totalTime(frame/fps,false);gsap.ticker.sleep();return cleanup;},scope);
  return ()=>context.revert();
 },[frame,fps,build]);
 return scope;
}
export {gsap,SplitText,MorphSVGPlugin,DrawSVGPlugin,MotionPathPlugin,CustomEase,Flip};
