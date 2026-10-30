import type {ScriptSpecV2,CreativeIssue} from '../contracts/creative-drafts';

type Sequence={durationSeconds:number;beats:string[];beatSeconds?:number[]};
/** Validate the sequence the renderer will actually use, including variant overrides. */
export function validateSequence(script:ScriptSpecV2,sequence:Sequence,path:string):CreativeIssue[]{
 const issues:CreativeIssue[]=[],add=(code:string,message:string,fix:string)=>issues.push({code,severity:'block',owner:'script',path,message,fix});
 const beats=sequence.beats.map(key=>script.beats.find(b=>b.key===key));
 if(!beats.length||beats.some(b=>!b)||new Set(sequence.beats).size!==beats.length)add('BEAT_BINDING','The selected edit has missing or repeated beats.','Bind each selected beat exactly once.');
 if(!beats.some(b=>b?.role==='hook')||beats.at(-1)?.role!=='cta')add('PROTECTED_CONTENT','The selected edit must include the hook and end with its CTA.','Restore the hook and put the CTA last.');
 const seconds=sequence.beatSeconds;
 if(seconds?.length&&(seconds.length!==beats.length||seconds.some(s=>!Number.isFinite(s)||s<=0)||Math.abs(seconds.reduce((n,s)=>n+s,0)-sequence.durationSeconds)>1e-6))add('BEAT_TIMING','Beat durations do not match the selected edit.','Supply one positive beatSeconds value per beat, totalling the ordered duration.');
 const source=script.sourceScenes??[];
 if(source.length){
  if(new Set(source.map(s=>s.sceneId)).size!==source.length||source.some((s,i)=>s.endTime<=s.startTime||Math.abs(s.startTime-(i?source[i-1].endTime:0))>1e-6))add('SOURCE_STORYBOARD_INVALID','The source storyboard has duplicate scenes, gaps or invalid time intervals.','Repair the source timing explicitly before compiling; never infer missing intervals.');
  const ids=beats.flatMap(b=>b?.sourceSceneIds??[]),known=new Set(source.map(s=>s.sceneId)),sourceDuration=Math.max(...source.map(s=>s.endTime));
  if(beats.some(b=>!b?.sourceSceneIds?.length)||ids.some(id=>!known.has(id))||new Set(ids).size!==ids.length)add('SCENARIO_BINDING','The selected edit cannot be traced to the approved storyboard.','Link every beat to its sourceSceneIds; do not invent or repeat source scenes.');
  if(sequence.durationSeconds>=sourceDuration&&source.some(s=>!ids.includes(s.sceneId)))add('SCENARIO_COVERAGE','An approved storyboard scene is absent from this edit.','Restore the missing source scenes, including their required visuals and actions.');
  if(Math.abs(sequence.durationSeconds-sourceDuration)<1e-6){
   if(ids.join('|')!==source.map(s=>s.sceneId).join('|'))add('SCENARIO_ORDER','The original-duration edit changes the storyboard order.','Keep the source scenes in their approved order.');
   const expected=beats.map(b=>(b?.sourceSceneIds??[]).reduce((n,id)=>{const s=source.find(s=>s.sceneId===id);return n+(s?s.endTime-s.startTime:0);},0));
   if(seconds?.length&&seconds.some((s,i)=>Math.abs(s-expected[i])>1e-6))add('SCENARIO_TIMING','The original-duration edit changes approved shot timing.','Use the original storyboard intervals for this duration.');
  }else if(!seconds?.length)add('BEAT_TIMING','An adapted duration needs an explicit edit rhythm.','Supply beatSeconds for this cutdown; do not divide every beat equally.');
 }else if(beats.length>(sequence.durationSeconds<8?2:4))add('CUTDOWN_BEAT_LIMIT','The variant binding exceeds the same beat limit enforced on its cutdown.','Repair the selected binding as well as the default cutdown.');
 return issues;
}

/** Original timing is authoritative; adapted edits carry explicit per-beat timing. */
export function sequenceFrames(script:ScriptSpecV2,sequence:Sequence,fps:number):number[]{
 if(validateSequence(script,sequence,'cutdowns').some(i=>i.severity==='block'))throw new Error('INVALID_EDIT_SEQUENCE');
 const source=script.sourceScenes??[],seconds=sequence.beatSeconds?.length?sequence.beatSeconds:source.length?sequence.beats.map(key=>script.beats.find(b=>b.key===key)!.sourceSceneIds!.reduce((n,id)=>{const s=source.find(s=>s.sceneId===id)!;return n+s.endTime-s.startTime;},0)):sequence.beats.map(()=>sequence.durationSeconds/sequence.beats.length);
 let elapsed=0,last=0;
 return seconds.map(s=>{elapsed+=s;const end=Math.round(elapsed*fps),frames=end-last;last=end;if(frames<1)throw new Error('BEAT_TOO_SHORT');return frames;});
}
