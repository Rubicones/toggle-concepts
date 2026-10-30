import {useCurrentFrame} from 'remotion';
import {EngineComposition} from './EngineComposition';
import type {FrameProgram} from '../packages/contracts/frame-program';
export type EngineBoardProps={programs:FrameProgram[];assetUrls:Record<string,string>;safeZones:boolean;issues:boolean;contactSheet?:boolean};
export function boardSize(programs:FrameProgram[],contactSheet=false){const columns=contactSheet?3:Math.max(1,programs.length),heights=programs.map(p=>360*p.height/p.width);return {width:columns*360,height:contactSheet?Math.max(360,heights.reduce((sum,h)=>sum+h,0)):Math.max(360,...heights)};}
export function EngineBoardComposition({programs,assetUrls,safeZones,issues,contactSheet=false}:EngineBoardProps){
 const frame=useCurrentFrame(),size=boardSize(programs,contactSheet),cells=contactSheet?programs.flatMap(program=>[.15,.5,.85].map(moment=>({program,frame:Math.floor(program.durationFrames*moment)}))):programs.map(program=>({program,frame:Math.min(program.durationFrames-1,Math.floor(frame*program.fps/60))}));
 return <div style={{display:'grid',gridTemplateColumns:`repeat(${contactSheet?3:Math.max(1,programs.length)}, 360px)`,alignItems:'center',height:size.height,background:'#16181d'}}>{cells.map(({program,frame:at},i)=><div key={`${program.id}.${i}`} style={{position:'relative',width:360,height:360*program.height/program.width}}><EngineComposition program={program.engine} assetUrls={assetUrls} safeZones={safeZones} issues={issues} frameOverride={at*program.engine.config.render.fps/program.fps}/></div>)}</div>;
}
