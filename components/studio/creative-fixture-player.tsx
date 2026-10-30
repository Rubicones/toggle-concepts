'use client';
import {Select} from '@/components/ui/select';
import {useState} from 'react';
import {Player} from '@remotion/player';
import {EngineBoardComposition,boardSize} from '@/remotion/EngineBoardComposition';
import type {FrameProgram} from '@/packages/contracts/frame-program';
export function CreativeFixturePlayer({programs,assetUrls}:{programs:FrameProgram[];assetUrls:Record<string,string>}){
 const [direction,setDirection]=useState(programs[0].directionId),[safe,setSafe]=useState(false),[issues,setIssues]=useState(false),selected=programs.filter(p=>p.directionId===direction),size=boardSize(selected);
 return <><label>Direction<Select value={direction} onChange={e=>setDirection(e.target.value)}>{programs.filter((p,i)=>programs.findIndex(x=>x.directionId===p.directionId)===i).map(p=><option key={p.directionId} value={p.directionId}>{p.title}</option>)}</Select></label><label><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Safe zones</label><label><input type="checkbox" checked={issues} onChange={e=>setIssues(e.target.checked)}/> Issues</label><Player key={direction} component={EngineBoardComposition} inputProps={{programs:selected,assetUrls,safeZones:safe,issues}} compositionWidth={size.width} compositionHeight={size.height} durationInFrames={240} fps={60} controls loop style={{width:'100%'}}/></>;
}
