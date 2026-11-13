// LC2: the run context of a 'shared' Local run, frozen once on the run's own device (Local runs never leave it) and
// read back byte for byte by every later request. It is built from the approved brief (C1) and the accepted brand
// (A1); before A1 there is no run context and requests keep the fresh layout.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {buildRunContext,type RunContext,type Skill} from '../../../packages/agents/run-context';
import {toggleHome} from './device';
import {brandPackText} from '../../../packages/brand/brand-pack';
import {storedPackText} from '../../../packages/brand/brand-pack-contents';
import {latestBrandPack} from '../../../packages/brand/brand-pack-store';
import {encodeCompactImages,encodePackImages,storedPicture,type PictureReader} from './pack-images';
import {compactSheetFor,type CompactPage} from '../compact-sheet';
import type {StoredBrandPack} from '../../../packages/brand/brand-pack-contents';
import {DEFAULT_MATERIAL_BUDGET,type MaterialBudget} from '../../../packages/agents/materials';

const dir=()=>join(toggleHome(),'local-claude','run-context');
export const runContextPath=(runId:string)=>join(dir(),`${runId}.json`);

export async function readRunContext(runId:string):Promise<RunContext|null>{
 try{return JSON.parse(await readFile(runContextPath(runId),'utf8')) as RunContext;}catch{return null;}
}

/** First write wins: a context once frozen is never rebuilt, whatever changes later. */
export async function freezeRunContext(runId:string,ctx:RunContext):Promise<RunContext>{
 await mkdir(dir(),{recursive:true});
 try{await writeFile(runContextPath(runId),JSON.stringify(ctx),{flag:'wx',mode:0o600});return ctx;}
 catch{return (await readRunContext(runId))??ctx;}
}

/** The frozen context, or one built now from the approved brief and the accepted brand; null before A1. */
export type ContextExtras={commonSkills:Skill[];roleSkills?:Record<string,Skill[]>;stageEffort?:Record<string,string>;/** C3: per-role material budgets from Models & agents */materialBudget?:Record<string,MaterialBudget>};
export async function loadRunContext(admin:SupabaseClient,runId:string,extras:()=>Promise<ContextExtras>=async()=>({commonSkills:[]}),deps:{read?:PictureReader;compact?:(pack:StoredBrandPack)=>Promise<CompactPage[]|null>}={}):Promise<RunContext|null>{
 const frozen=await readRunContext(runId);if(frozen)return frozen;
 const c1=await admin.from('studio_c1_checkpoints').select('brief_text').eq('run_id',runId).maybeSingle();
 if(c1.error||!c1.data?.brief_text)return null;
 const a1=await admin.from('studio_a1_reviews').select('brand_revision_id,round_no').eq('run_id',runId).eq('decision','accepted').order('round_no',{ascending:false}).limit(1).maybeSingle();
 if(a1.error||!a1.data?.brand_revision_id)return null;
 const brand=await admin.from('studio_brand_revisions').select('canonical_text').eq('id',a1.data.brand_revision_id).maybeSingle();
 if(brand.error||!brand.data?.canonical_text)return null;
 // C2 (second part): the version of the stored brand pack current now (character, rules, catalogue and pictures).
 // Without the migration or before a character exists, the first part's pack below.
 const stored=await latestBrandPack(admin,a1.data.brand_revision_id);
 // Pictures every role reads: the compact brand sheet (built now if the version has none yet); without it, the
 // signature pictures. The full brand sheet stays with the roles that design or judge pictures, outside the prefix.
 if(stored){
  const read=deps.read??storedPicture,compact=await (deps.compact??(p=>compactSheetFor(admin,p)))(stored);
  const packImages=(compact?.length?await encodeCompactImages(compact,read):null)??await encodePackImages(stored,read);
  // C3: the catalogue's entries can be asked for by name, inside each role's budget (defaults without the setting).
  // C9: contexts frozen from now on let the planning chain read the earlier stages in short; C7 follow-up: their
  // planning roles send the answer format as text, so every role reads the same cached prefix.
  const {materialBudget,...rest}=await extras();
  return freezeRunContext(runId,buildRunContext({briefText:c1.data.brief_text,brandPack:storedPackText(stored,brand.data.canonical_text),packVersion:stored.version,packImages,...rest,materials:{entries:stored.catalogue,budget:{...DEFAULT_MATERIAL_BUDGET,...materialBudget}},planningChat:true,schemaInText:true}));
 }
 // C2: contexts frozen from now on carry the brand pack instead of the raw revision; frozen ones keep theirs.
 const brandPack=brandPackText(brand.data.canonical_text);
 const {materialBudget:_unused,...rest}=await extras();void _unused;
 return freezeRunContext(runId,buildRunContext({briefText:c1.data.brief_text,...(brandPack?{brandPack}:{brandText:brand.data.canonical_text}),...rest}));
}
