// What each supplied brand file is, how it is read and which fields it may state. A role decides how far a file is
// trusted, not what may be taken from it: a product screenshot may still name the product when nothing else does.
import {brandFieldKeys} from './field-extraction';

export const materialRoles=['brandbook','tokens','logo','font','licence','screenshot','uikit','photo','reference','unknown'] as const;
export type MaterialRole=typeof materialRoles[number];
type Field=typeof brandFieldKeys[number];

export const materialRoleLabels:Record<MaterialRole,string>={brandbook:'Brandbook / guidelines',tokens:'Design tokens',logo:'Logo / wordmark / icon',font:'Font file',licence:'Font licence',screenshot:'Product screenshot',uikit:'UI kit / interface components',photo:'Photo',reference:'Reference / moodboard',unknown:'Not sure yet'};

/** Fields a file of this role may state; null means any field. */
const allowed:Record<MaterialRole,readonly Field[]|null>={
 brandbook:null,unknown:null,
 tokens:['primaryColors','secondaryColors','semanticColors','displayFonts','bodyFonts','monoFonts','typographyRules','spacing','layout','safeArea','motion'],
 logo:['brandName','wordmark','icon','logoUsage','primaryColors','secondaryColors'],
 font:['displayFonts','bodyFonts','monoFonts','fontLicenses'],
 licence:['fontLicenses'],
 // A screenshot shows the product: its name and interface, never the brand's copy rules or primary palette.
 screenshot:['brandName','brandDescription','productIdentity','components','semanticColors','layout','imagery'],
 // A UI kit shows the product's interface parts: components and their interface colours, never brand copy or the palette.
 uikit:['components','semanticColors','spacing','layout','typographyRules'],
 photo:['imagery','photography','productIdentity'],
 reference:['imagery','photography','illustration','motion','layout'],
};
/** Fields a role may never state (rejected from its findings when the role is set or confirmed). */
export function fieldsOutsideRole(role:MaterialRole):Field[]{const list=allowed[role];return list?brandFieldKeys.filter(f=>!list.includes(f)):[];}

/** Applied to one read: screenshot and UI kit colours are interface colours; anything else outside the role is dropped. */
export function findingsForRole<T extends {field:string}>(role:MaterialRole,findings:T[]):T[]{
 const list=allowed[role];if(!list)return findings;
 return findings.map(f=>(role==='screenshot'||role==='uikit')&&(f.field==='primaryColors'||f.field==='secondaryColors')?{...f,field:'semanticColors'}:f).filter(f=>f.field.startsWith('brief.')?role==='brandbook':list.includes(f.field as Field));
}

export const roleReadingNotes:Record<MaterialRole,string>={
 brandbook:'This file is the brand\'s own guidelines: its statements are the strongest evidence.',
 tokens:'This file holds design tokens: report colours, type and spacing values with their token names; do not invent roles the tokens do not name.',
 logo:'This file is brand artwork (logo, wordmark or icon): report what it shows; it is not a source of copy or voice.',
 font:'This file is a font: report the family, weights and licence facts it contains.',
 licence:'This file is a font licence: report only licence facts.',
 screenshot:'This file is a screenshot of the product: its name, interface and interface colours are product evidence; its on-screen texts are product vocabulary, never brand copy rules or voice; its colours are interface colours, not the brand palette.',
 uikit:'This file is part of the product\'s UI kit: an interface component, not a screenshot to imitate and not a brand rule. Name each component, its parts, states and sizes, the token or interface colours it uses and the kind of text it carries. It is the visual vocabulary for interface mockups built in code; its texts are never brand copy and its colours are interface colours, never the brand palette.',
 photo:'This file is a photograph: report only what it shows about imagery and the product.',
 reference:'This file is a reference or moodboard image: report only visual treatment; it is not the brand\'s own artwork or copy.',
 unknown:'What this file is has not been decided: first judge whether it is guidelines, artwork, a product screenshot, a UI kit component, a photo or a reference, and report only what such a file can state.',
};

type MaterialLike={filename:string;relative_path?:string|null;mime:string;extraction?:{kind?:string;text?:string;metadata?:Record<string,unknown>}|null};
/** Deterministic first guess; `sure:false` asks the AD. */
export function autoMaterialRole(m:MaterialLike):{role:MaterialRole;sure:boolean}{
 const name=`${m.relative_path??''} ${m.filename}`.toLowerCase(),text=(m.extraction?.text??'').slice(0,4000),kind=m.extraction?.kind;
 if(kind==='font'||typeof m.extraction?.metadata?.family==='string'||/\.(woff2?|ttf|otf)$/.test(name))return {role:'font',sure:true};
 if(/(^|[\s/_-])(ofl|licen[cs]e)/.test(name)||/SIL OPEN FONT LICEN[CS]E|font software/i.test(text))return {role:'licence',sure:true};
 if(m.mime==='application/json'||/\.json$/.test(name))return {role:'tokens',sure:/token|theme|colou?r|design/.test(name)||(text.match(/#[0-9a-f]{6}\b/gi)?.length??0)>=3};
 // UI kit parts: a named kit or components folder is sure; a single button/card/chip file name or a tokens folder asks.
 const kit=/ui[-_ ]?kit|(^|[\s/_-])components?([\s/_.-]|$)/.test(name),part=/(^|[\s/_-])(buttons?|cards?|chips?|inputs?|toggles?|tabs?)([\s/_.-]|$)|(^|[\s/])tokens\//.test(name);
 if(m.mime.startsWith('image/')&&(kit||part))return {role:'uikit',sure:kit};
 if(m.mime==='image/svg+xml'){const named=/logo|wordmark|lockup|icon|mark|symbol/.test(name);return {role:'logo',sure:named};}
 if(m.mime.startsWith('image/')){
  if(/screen|screenshot|(^|[\s/_-])ui([\s/_.-]|$)|interface|dashboard|app[-_ ]?shot|mockup/.test(name))return {role:'screenshot',sure:true};
  if(/logo|wordmark|lockup|icon|favicon/.test(name))return {role:'logo',sure:true};
  if(/mood|reference|ref[-_ ]|inspiration/.test(name))return {role:'reference',sure:true};
  if(/photo|img_|dsc|pexels|unsplash/.test(name))return {role:'photo',sure:true};
  return {role:'unknown',sure:false};
 }
 if(kind==='pdf'||kind==='document'||kind==='text'||/\.(md|pdf|docx?|txt)$/.test(name))return {role:'brandbook',sure:/brand|guide|style|identity|book/.test(name)||text.length>2000};
 return {role:'unknown',sure:false};
}
export function effectiveMaterialRole(m:MaterialLike&{role?:string|null}):{role:MaterialRole;sure:boolean;bySomeone:boolean}{
 if(m.role&&(materialRoles as readonly string[]).includes(m.role))return {role:m.role as MaterialRole,sure:true,bySomeone:true};
 return {...autoMaterialRole(m),bySomeone:false};
}
