import {emptyBrandDraft,newBrandRule,type BrandDraft} from '../contracts/brand-kit';
import type {BrandSystem} from '../contracts/creative-drafts';
import {resolveBrandSystem,type CreativeMaterial} from './resolve-system';
/** Offline recovery when a capture contains the resolved snapshot, but not its original accepted A1 rules. */
export function reresolveBrandSnapshot(brand:BrandSystem,locales:string[]){
 const kit=emptyBrandDraft(locales);let n=0;
 const rule=(category:BrandDraft['rules'][number]['category'],key:string,value:string,material?:string)=>{const id=`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;kit.rules.push({...newBrandRule(category,key,id),value,status:'provided',decision:'accepted',sourceVerified:true,provenance:{kind:material?'material':'ad_instruction',sourceId:material??null,locator:'Frozen captured BrandSystem'}});};
 for(const c of brand.palette)rule('color',c.id,c.hex);
 for(const [role,key]of [['headline','headlineFamily'],['body','bodyFamily'],['accent','monospaceFamily']] as const){const font=brand.fonts.find(f=>f.role===role);if(font)rule('typography',key,font.family);}
 rule('motion','motionSystem',JSON.stringify(brand.motion));rule('typography','limits',JSON.stringify(brand.limits));rule('imagery','treatment',brand.imagery.treatment);rule('voice','tone',brand.voice.tone);rule('product','name',brand.product.name);rule('product','immutables',brand.product.immutables.join('\n'));
 const materials:CreativeMaterial[]=brand.fonts.flatMap(font=>font.files.map(file=>({id:file.revisionId,sha256:file.sha256,mime:'font/sfnt',objectKey:file.objectKey,state:'ready',metadata:{family:font.family,weight:file.weight,unitsPerEm:font.unitsPerEm,glyphCoverage:font.glyphCoverage,averageAdvance:font.averageAdvance,averageAdvanceByScript:font.averageAdvanceByScript}})));
 for(const logo of brand.logos){rule('logo',logo.role,logo.objectKey,logo.revisionId);materials.push({id:logo.revisionId,sha256:logo.sha256,mime:logo.mime,objectKey:logo.objectKey,state:'ready',metadata:{role:logo.role,svg:logo.svg,ground:logo.ground,viewBox:logo.viewBox}});}
 kit.sourceMaterialIds=materials.map(m=>m.id);kit.sourceAssetIds=brand.product.media;
 const result=resolveBrandSystem({id:brand.revisionId,kit},materials);
 result.system.styles=brand.styles;
 result.system.prohibitions=brand.prohibitions;
 result.system.fallbacks.push({path:'capture.brand',reason:'The raw accepted A1 kit was not captured; re-resolved from frozen BrandSystem fields.',value:brand.revisionId});
 return result;
}
