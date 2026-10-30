type HistoryBlock={round_id:string;snapshot:{inputs:{directionId:string}[]}};
/** Oldest approved inputs establish the AD's numbering; a one-direction continuation cannot renumber the others. */
export function directionHistory(blocksNewestFirst:HistoryBlock[],currentRoundId:string){
 const rounds=new Map<string,string[]>(),result=new Map<string,{number:number;archived:boolean}>();
 for(const block of [...blocksNewestFirst].reverse()){
  const order=rounds.get(block.round_id)??[];rounds.set(block.round_id,order);
  for(const input of block.snapshot.inputs){if(!order.includes(input.directionId))order.push(input.directionId);result.set(input.directionId,{number:order.indexOf(input.directionId)+1,archived:block.round_id!==currentRoundId});}
 }
 return result;
}
