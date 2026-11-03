// Data for the brand sheet (designer pipeline plan, point 1), read with a service client so both the local runner
// (no browser session) and the studio route use the same source: the brand card from the current findings and files.
import type {SupabaseClient} from '@supabase/supabase-js';
import {buildBrandCard} from './brand-card';
import {effectiveMaterialRole} from './material-roles';
import {inkColours,logoInkVariants} from './normalize';
import type {BrandSheetInput,SheetAssets,SheetMaterial} from './brand-sheet';

type Row={id:string;filename:string;relative_path:string|null;mime:string;object_key:string;extraction:{kind?:string;text?:string;metadata?:Record<string,unknown>}|null;role?:string|null};
export type BrandSheetSource=BrandSheetInput&{files:Map<string,{objectKey:string;mime:string}>;svg:Map<string,string>};
const fontMime=(mime:string,bytes:Buffer)=>{const tag=bytes.subarray(0,4).toString('latin1');return /woff2/.test(mime)||tag==='wOF2'?'font/woff2':tag==='wOFF'?'font/woff':tag==='OTTO'?'font/otf':'font/ttf';};

export async function loadBrandSheetSource(admin:SupabaseClient,tenant:string,campaign:string,get:(key:string)=>Promise<Buffer>):Promise<BrandSheetSource>{
 const base='id,filename,relative_path,mime,object_key,extraction';
 const q=(cols:string)=>admin.from('studio_brand_materials').select(cols).eq('tenant_id',tenant).eq('campaign_id',campaign).eq('state','ready').order('relative_path').limit(500);
 let res=await q(`${base},role`);if(res.error)res=await q(base);if(res.error)throw new Error(res.error.message);
 const rows=(res.data??[]) as unknown as Row[];
 const materials=rows.map(r=>{const role=effectiveMaterialRole({filename:r.filename,relative_path:r.relative_path,mime:r.mime,extraction:r.extraction??undefined,role:r.role});return {row:r,role:role.role,sure:role.sure};});
 const svg=new Map<string,string>();
 for(const m of materials)if(m.role==='logo'&&m.row.mime==='image/svg+xml'){try{svg.set(m.row.id,(await get(m.row.object_key)).toString('utf8').slice(0,200000));}catch{/* shown as a file without colour variants */}}
 const findings:{id:string;field:string;value:string;edited_value:string|null;decision:string;version:number;material_id:string;evidence:string;locator:string}[]=[];
 for(let offset=0;offset<10000;offset+=1000){const page=await admin.from('studio_brand_findings').select('id,field,value,edited_value,decision,version,material_id,evidence,locator').eq('tenant_id',tenant).eq('campaign_id',campaign).order('seq').range(offset,offset+999);if(page.error)throw new Error(page.error.message);findings.push(...(page.data??[]));if((page.data??[]).length<1000)break;}
 const card=buildBrandCard(findings,materials.map(m=>({id:m.row.id,filename:m.row.filename,mime:m.row.mime,role:m.role,sure:m.sure,metadata:m.row.extraction?.metadata??null,svgText:svg.get(m.row.id)??null})));
 const live=findings.filter(f=>f.decision!=='reject');
 const typographyRules=[...live.filter(f=>f.field==='typographyRules'),...live.filter(f=>['displayFonts','bodyFonts','monoFonts'].includes(f.field)&&(f.edited_value??f.value).trim().split(/\s+/).length>=5)].map(f=>(f.edited_value??f.value).trim()).slice(0,20);
 const cp=await admin.from('studio_c1_checkpoints').select('payload').eq('tenant_id',tenant).eq('campaign_id',campaign).order('created_at',{ascending:false}).limit(1).maybeSingle();
 const scoped=(cp.data as {payload?:{scope?:{locales?:unknown}}}|null)?.payload?.scope?.locales;
 const locales=Array.isArray(scoped)&&scoped.every(l=>typeof l==='string')&&scoped.length?scoped as string[]:['en-GB'];
 const sheetMaterials:SheetMaterial[]=materials.map(m=>({id:m.row.id,filename:m.row.filename,mime:m.row.mime,role:m.role}));
 return {card,materials:sheetMaterials,locales,typographyRules,files:new Map(rows.map(r=>[r.id,{objectKey:r.object_key,mime:r.mime}])),svg};
}

/** Every referenced file as a data URL, so the page renders offline. SVG logos drawn in currentColor get both inks. */
export async function inlineSheetAssets(source:BrandSheetSource,get:(key:string)=>Promise<Buffer>):Promise<SheetAssets>{
 const ink=inkColours([...source.card.palette.map(p=>p.value),'#FFFFFF','#111111']),cache=new Map<string,string>();
 const ids=new Set<string>([...source.card.logos.map(l=>l.id),...source.card.fonts.flatMap(f=>f.files.map(x=>x.id)),...source.card.interfaceFiles.map(f=>f.id),...source.materials.filter(m=>m.mime.startsWith('image/')).map(m=>m.id)]);
 for(const id of ids){
  const file=source.files.get(id);if(!file)continue;
  let bytes:Buffer;try{bytes=await get(file.objectKey);}catch{continue;}
  const font=!file.mime.startsWith('image/'),mime=font?fontMime(file.mime,bytes):file.mime;
  cache.set(id,`data:${mime};base64,${bytes.toString('base64')}`);
  const svg=source.svg.get(id),variants=svg?logoInkVariants(svg,ink):null;
  if(variants)for(const g of ['dark','light'] as const)cache.set(`${id}:${g}`,`data:image/svg+xml;base64,${Buffer.from(g==='dark'?variants.onDark:variants.onLight,'utf8').toString('base64')}`);
 }
 return {file:(id,ground)=>cache.get(ground?`${id}:${ground}`:id)??cache.get(id)??'data:,'};
}
