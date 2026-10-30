import type {WorkState} from './state';
/** Recover only a complete, unsubmitted legacy preflight trace. Never reset paid work. */
export function recoverUnsubmittedClock(state:WorkState,noRequests:boolean){
 const events=state.events??[],started=state.roleStartedAt?.director;
 if(!noRequests||state.workingClockVersion===2||state.phase!=='director'||started===undefined||state.activeCall||state.directorFeedback?.length||state.assembler||!events[0]?.text.startsWith('Work started (phase: director'))return null;
 const firstStop=events.find(e=>e.text.startsWith('Stopped:'));
 if(!firstStop||started<events[0].at||started>firstStop.at)return null;
 let open:number|undefined,elapsed=0,lastStop:number|undefined;
 for(const event of events){
  if(event.text.startsWith('Work started (phase: director')){if(open!==undefined)return null;open=event.at;}
  else if(event.text.startsWith('Stopped:')){if(open===undefined||event.at<open)return null;elapsed+=event.at-open;lastStop=event.at;open=undefined;}
 }
 if(open!==undefined||lastStop===undefined||state.reviewStartedAt===undefined||Math.abs(state.reviewStartedAt-lastStop)>5000)return null;
 const excludedMs=state.reviewStartedAt-started-elapsed;if(excludedMs<=0)return null;
 const recovered=structuredClone(state);
 recovered.roleStartedAt={...recovered.roleStartedAt,director:state.reviewStartedAt-elapsed};
 recovered.workingClockVersion=2;
 return {state:recovered,activeMs:elapsed,excludedMs};
}
