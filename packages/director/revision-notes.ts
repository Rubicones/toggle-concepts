import type {BlockSnapshot,RoutedNote} from './state';
import {reviewKey} from './review';

type RevisionBlock={id:string;snapshot:{seedWork?:Record<string,{iterationId:string}>;seedIterationIds?:BlockSnapshot['seedIterationIds'];notes?:BlockSnapshot['notes']}};
type RevisionWork={block_id:string;iteration_id:string};
/** Source ancestry needs scalar pointers and notes, never every inherited source file. */
export function revisionMetadataProjection(directionId:string){
 if(!/^[0-9a-f-]{36}$/i.test(directionId))throw new Error('INVALID_DIRECTION_ID');
 return `id,run_id,round_id,status,seedWorkIterationId:snapshot->seedWork->${directionId}->>iterationId,seedIterationId:snapshot->seedIterationIds->>${directionId},notes:snapshot->notes->${directionId}`;
}
export function revisionMetadataBlock<T extends {id:string;seedWorkIterationId?:string|null;seedIterationId?:string|null;notes?:RoutedNote[]|null}>(row:T,directionId:string){
 return {...row,snapshot:{...(row.seedWorkIterationId?{seedWork:{[directionId]:{iterationId:row.seedWorkIterationId}}}:{}),...(row.seedIterationId?{seedIterationIds:{[directionId]:row.seedIterationId}}:{}),notes:{[directionId]:row.notes??[]}}};
}
/** Follow actual source ancestry only, never unrelated or superseded creative branches. */
export function revisionAncestors(blocks:RevisionBlock[],works:RevisionWork[],iterations:{id:string;block_id:string}[],blockId:string,directionId:string){
 const owners=new Map(iterations.map(i=>[i.id,i.block_id]));for(const work of works)owners.set(work.iteration_id,work.block_id);
 const result:RevisionBlock[]=[],seen=new Set<string>();let current=blocks.find(b=>b.id===blockId);
 while(current&&!seen.has(current.id)){
  seen.add(current.id);result.unshift(current);
  const source=current.snapshot.seedWork?.[directionId]?.iterationId??current.snapshot.seedIterationIds?.[directionId];
  current=source?blocks.find(b=>b.id===owners.get(source)):undefined;
 }
 return result;
}

/** Continuations retain AD intent and captured-view evidence without duplicating copied notes. */
export function revisionNotes(...groups:(readonly RoutedNote[]|undefined)[]):RoutedNote[]{
 const result:RoutedNote[]=[],seen=new Set<string>();
 for(const group of groups)for(const note of group??[]){
  const key=JSON.stringify([note.recipient,note.text,note.target?reviewKey(note.target):null]);if(seen.has(key))continue;seen.add(key);
  // This workspace rehydrates evidence; a path in the previous folder is not authoritative.
  result.push({recipient:note.recipient,text:note.text,...(note.target?{target:structuredClone(note.target)}:{})});
 }
 return result;
}
