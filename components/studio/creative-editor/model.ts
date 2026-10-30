import type {DraftEdits} from '@/packages/contracts/draft-edits';
import type {DirectionProgram,CreativeDirection,FrameResource} from '@/packages/contracts/frame-program';
import type {BrandSystem,CopyBudget} from '@/packages/contracts/creative-drafts';
import type {CampaignScope,VariantEntry} from '@/packages/contracts/campaign';
import type {VariantState} from '@/packages/engine/types';
import type {EditPolicy} from '@/packages/creative/draft-edits';
export type EditorWorkspace={agentProgram:DirectionProgram;source:CreativeDirection;input:{brand:BrandSystem;budget:CopyBudget;scope:CampaignScope;variants:VariantEntry[];resources:FrameResource[];policy:EditPolicy};edits:DraftEdits;revision:number;sourceHash:string;approved:boolean;fonts:{role:string;url:string;sha256:string}[];assets:Record<string,string>};
export type EditHistory={past:DraftEdits[];current:DraftEdits;future:DraftEdits[]};
export function recordEdit(h:EditHistory,next:DraftEdits):EditHistory{return JSON.stringify(h.current)===JSON.stringify(next)?h:{past:[...h.past.slice(-49),h.current],current:next,future:[]};}
export function undoEdit(h:EditHistory):EditHistory{return h.past.length?{past:h.past.slice(0,-1),current:h.past.at(-1)!,future:[h.current,...h.future]}:h;}
export function redoEdit(h:EditHistory):EditHistory{return h.future.length?{past:[...h.past,h.current],current:h.future[0],future:h.future.slice(1)}:h;}
/** Pick only an ordered state. Switching controls never requests another program. */
export function selectVariant(p:DirectionProgram,current:VariantState,axis:keyof VariantState,value:string):VariantState{
 const matches=p.variants.filter(v=>v.state[axis]===value);const ranked=matches.sort((a,b)=>Object.entries(current).filter(([k,v])=>b.state[k as keyof VariantState]===v).length-Object.entries(current).filter(([k,v])=>a.state[k as keyof VariantState]===v).length);
 return ranked[0]?.state??current;
}
