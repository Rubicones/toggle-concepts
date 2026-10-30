import type {GuidedRunView} from './guided-run';
export const stageJobKeys:Record<string,string[]>={brand:[],strategy:['research','strategy','variants'],script:['script'],visuals:['asset-plan','localization'],assembly:[],review:[],finals:[]};
export function savedStageOutputs(view:GuidedRunView,stage:string){
 if(stage==='brand')return view.steps.filter(s=>s.role==='brand-kit'&&s.output).map(s=>({id:s.id,label:'Brand proposal',state:s.status,output:s.output!}));
 if(stage==='assembly')return view.jobs.filter(j=>j.kind==='compile'&&j.output).map(j=>({id:j.id,label:'Compiled preview batch',state:j.state,output:j.output!}));
 return (stageJobKeys[stage]??[]).flatMap(key=>{const job=view.jobs.find(j=>j.job_key===key),failure=view.failureStep?.jobId===job?.id?view.failureStep:null,output=job?.output??failure?.output;if(!job||!output)return [];return [{id:job.id,label:key==='asset-plan'?'Visual direction':key==='script'?'Scenarios':key[0].toUpperCase()+key.slice(1),state:job.state,output}];});
}
export function readableOutput(text:string){try{const parsed=JSON.parse(text);return {summary:typeof parsed.summary==='string'?parsed.summary:'',deliverable:parsed.deliverable??parsed,questions:Array.isArray(parsed.blockingQuestions)?parsed.blockingQuestions:[],warnings:Array.isArray(parsed.warnings)?parsed.warnings:[],assumptions:Array.isArray(parsed.assumptions)?parsed.assumptions:[]};}catch{return {summary:'',deliverable:text,questions:[],warnings:[],assumptions:[]};}}
