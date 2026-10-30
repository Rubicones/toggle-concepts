import {requestId} from './money';
import type {WorkState} from './state';
export type LiveControl={id:string;action:'note'|'wrap-up'|'stop';recipient?:'director'|'assembler';body?:string;target?:import('./review').ReviewTarget};
/** Pure application at safe boundaries. No new paid allowance is created. */
export function applyLiveControls(state:WorkState,controls:LiveControl[]){
 let reviseDirector=false,reviseCoder=false,stopped=false;for(const control of controls){if(state.appliedControls?.includes(control.id))continue;state.appliedControls=[...(state.appliedControls??[]),control.id];
 if(control.action==='stop')stopped=true;
 if(control.action==='wrap-up')state.wrapUp=true;
 if(control.action==='note'&&control.recipient&&control.body){state.notes=[...(state.notes??[]),{recipient:control.recipient,text:control.body,...(control.target?{target:control.target}:{})}];reviseDirector||=control.recipient==='director';reviseCoder||=control.recipient==='assembler';}}
 return {reviseDirector,reviseCoder,stopped};
}

/** Notes start a fresh request lineage even if the preceding source was not sealed yet. */
export function beginLiveRevision(state:WorkState,identity:{blockId:string;directionId:string}){
 if(!state.liveRevision)return;
 if(state.liveRevision==='director'){state.previousDesign=state.design;state.design=undefined;state.directorFeedback=[];}
 delete state.liveRevision;state.phase=state.design?'resources':'director';state.pendingSource=state.folder;
 state.assembler={turn:0,startedAt:state.assembler?.startedAt??Date.now(),transcript:[],complete:false};
 if(state.sourceHash){state.iteration=(state.iteration??1)+1;state.sourceHash=undefined;}
 state.iterationId=requestId({...identity,iteration:state.iteration??1,liveNotes:state.appliedControls??[]});
}
