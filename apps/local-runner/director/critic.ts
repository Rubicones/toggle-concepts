import {staticCriticEvidence} from './static-evidence';
import {staticCriticInput} from '../../../packages/director/inputs';
import type {SupabaseClient} from '@supabase/supabase-js';
import {checked} from '../../../packages/data/shared-runtime';
import type {DirectionInput} from '../../../packages/director/types';
import type {WorkState,ADQuestion} from '../../../packages/director/state';
import {readCritique,critiqueDecision} from '../../../packages/director/critic';
import {requestId} from '../../../packages/director/money';
import {criticEvidence} from './filmstrips';
export async function critiqueIteration(args:{admin:SupabaseClient;blockId:string;input:DirectionInput;state:WorkState;folder:string;device:string;token:number;call:(context:unknown,images:{url:string;label:string}[])=>Promise<{text:string;costMicroUsd:number;requestId:string}>;emit?:ReturnType<typeof import('./events').directorEvents>['emit'];save:(status:string,question?:ADQuestion|null)=>Promise<void>}){
 const {input,state,admin}=args,prior=checked(await admin.from('studio_director_assessments').select('iteration_id,payload').eq('block_id',args.blockId).eq('direction_id',input.directionId))??[];
 const same=prior.find(p=>p.iteration_id===input.iterationId);if(!same&&prior.length>=2)throw new Error('CRITIC_ROUND_LIMIT');
 state.phase='critic';await args.save('running');
 let assessment;if(same)assessment=same.payload;else{
  const evidence=await (input.stage==='draft'?staticCriticEvidence(args.folder,input):criticEvidence(args.folder,input)),response=await args.call({input:input.stage==='draft'?staticCriticInput(input):input,resources:input.stage==='draft'?state.design!.resources.map(r=>({id:r.id,scene:r.scene,purpose:r.purpose,proxy:r.proxy,proxyFor:r.proxyFor})):state.design!.resources,keyFrames:state.design!.keyFrames,designDocument:state.design!.designDocument,objectiveReports:state.reports,evidence:evidence.manifest},evidence.images),critique=readCritique(JSON.parse(response.text));assessment={critique,evidence:evidence.manifest,costMicroUsd:response.costMicroUsd,requestId:response.requestId};
  checked(await admin.rpc('studio_record_director_assessment',{target:args.blockId,direction:input.directionId,iteration:input.iterationId,device:args.device,token:args.token,document:assessment}));
 }
 await args.emit?.('critic:notes',{stepId:'critic',kind:'critic',status:'done',message:assessment.critique.summary,detail:assessment.critique});
 const iterations=checked(await admin.from('studio_director_iterations').select('id,iteration_no').eq('block_id',args.blockId).eq('direction_id',input.directionId).order('iteration_no'))??[];
 const decision=critiqueDecision(readCritique(assessment.critique),same?prior.length:prior.length+1,{directionId:input.directionId,iterationIds:iterations.map(i=>i.id)});
 if(decision.state==='accepted'){state.phase='complete';await args.save('done');return;}
 if(decision.state==='question'){await args.save('review',decision.question);return;}
 state.previousDesign=state.design;state.notes=decision.notes;state.pendingSource=args.folder;state.iteration=(state.iteration??1)+1;state.iterationId=requestId({blockId:args.blockId,directionId:input.directionId,iteration:state.iteration});if(decision.director.length)state.design=undefined;
 state.phase=state.design?'resources':'director';state.assembler={turn:0,startedAt:state.assembler!.startedAt,transcript:[],complete:false};state.directorFeedback=[];await args.save('queued');
}
