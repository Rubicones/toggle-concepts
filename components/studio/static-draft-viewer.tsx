'use client';
import type {DirectorView} from '@/packages/director/view';
import type {Variant} from '@/packages/director/types';
import {LiveDraftGenerator} from './live-draft-generator';
/** Compatibility entry point: viewing a draft never queues an image export. */
export function StaticDraftViewer({iteration,endpoint}:{iteration:DirectorView['iterations'][number];variants:Variant[];endpoint:string;busy:boolean;command:(body:Record<string,unknown>)=>Promise<boolean>}){
 return <LiveDraftGenerator endpoint={endpoint} directionId={iteration.directionId} iterationId={iteration.id}/>;
}
