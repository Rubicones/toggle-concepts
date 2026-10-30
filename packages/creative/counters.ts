import type {CreativeRepair} from '../contracts/creative-drafts';
import {structuralCode} from './value-validation';
export type CreativeCounters={l0KeyRepairs:number;structuralPaidRepairs:number;structuralPaidMicroUsd:number;slotReasks:number;labelReorders:number;truncations:number;defaults:number};
export const emptyCreativeCounters=():CreativeCounters=>({l0KeyRepairs:0,structuralPaidRepairs:0,structuralPaidMicroUsd:0,slotReasks:0,labelReorders:0,truncations:0,defaults:0});
export type CounterReceipt={id:string;output:string|null;costMicroUsd:number|null;snapshot?:{creativeRepair?:boolean;campaignContext?:{repairRequest?:{slots?:string[];issues?:{code:string}[]}}}};
/** One retained normalization per receipt, including reprocessed receipts; polling or duplicate rows never increments totals. */
export function creativeCounters(records:CounterReceipt[]):CreativeCounters{
 const counters=emptyCreativeCounters();
 for(const record of new Map(records.map(r=>[r.id,r])).values()){
  let logs:CreativeRepair[]=[];try{const result=JSON.parse(record.output??'null');if(result?.version==='creative-result@1'&&Array.isArray(result.repairLog))logs=result.repairLog;}catch{/* A failed/noncreative answer contains no normalization actions. */}
  for(const log of logs){if(!log||typeof log.code!=='string')continue;if(log.level==='L0'&&structuralCode(log.code))counters.l0KeyRepairs++;if(log.code==='LABEL_REORDER')counters.labelReorders++;if(log.code==='SLOT_TRUNCATION')counters.truncations++;if(log.code==='SLOT_DEFAULT')counters.defaults++;}
  const request=record.snapshot?.campaignContext?.repairRequest;
  if(record.snapshot?.creativeRepair){counters.slotReasks+=new Set(request?.slots??[]).size;
   if((record.costMicroUsd??0)>0&&request?.issues?.some(i=>structuralCode(i.code))){counters.structuralPaidRepairs++;counters.structuralPaidMicroUsd+=record.costMicroUsd!;}
  }
 }
 return counters;
}
