import type {BrandSystem} from '../contracts/creative-drafts';
import {graphicProposalSchema,graphicVocabularySchema,vectorShapeSchema} from '../contracts/graphic-vocabulary';
import type {Kit,VectorShape} from '../engine/types';
import {contrastRatio} from '../engine/engine/util';
import {parseSvg} from '../engine/engine/svg';
export type GraphicVocabulary=Pick<Kit,'paints'|'treatments'|'marks'>&{icons:Kit['graphics']};
/** Accept only the tiny engine vector subset. Unsupported SVG cannot silently lose its semantics. */
export function approvedVector(svg:string,palette:BrandSystem['palette']):VectorShape{
 if(/<(?:script|text|image|foreignObject|use|filter|linearGradient|radialGradient)\b|\bon\w+\s*=|url\(|href\s*=|\btransform\s*=/i.test(svg))throw new Error('Unsupported SVG content');
 const shape=vectorShapeSchema.parse(parseSvg(svg));if(!shape.paths.length)throw new Error('Empty SVG');
 const allowed=new Set([...palette.map(c=>c.hex.toLowerCase()),...palette.map(c=>c.id.toLowerCase()),'currentcolor']);
 for(const p of shape.paths)for(const c of [p.fill,p.stroke])if(c&&!allowed.has(c.toLowerCase()))throw new Error(`Colour outside the brand palette: ${c}`);
 return shape;
}
export function graphicDefaults(palette:BrandSystem['palette']):GraphicVocabulary{
 const role=(r:string)=>palette.find(c=>c.roles.includes(r as never))??palette[0],field=role('field'),surface=role('surface'),accent=role('accent'),ink=[...palette].sort((a,b)=>contrastRatio(b.hex,accent.hex)-contrastRatio(a.hex,accent.hex))[0];
 return {paints:{field:{kind:'flat',color:field.id},gradient:{kind:'gradient',type:'linear',angle:115,stops:[{at:0,color:field.id},{at:1,color:surface.id}]},edge:{kind:'flat',color:accent.id}},treatments:{plain:{kind:'plain'},button:{kind:'button',pad:[.25,.6,.25,.6],radius:'pill',fill:accent.id,on:ink.id},plaque:{kind:'plaque',pad:[.12,.25,.12,.25],radius:.08,fill:accent.id,on:ink.id},marker:{kind:'highlight',fill:accent.id,pad:[.08,.03],height:.7,offset:.03,on:ink.id}},marks:{},icons:{}};
}
export function resolveGraphics(palette:BrandSystem['palette'],proposal:unknown,override:unknown){
 const vocabulary=graphicDefaults(palette),warnings:string[]=[];
 if(proposal!==undefined){const result=graphicProposalSchema.safeParse(proposal);if(!result.success)warnings.push('Invalid structured graphic proposal; using brand defaults.');else{
  const p=result.data;if(p.button&&vocabulary.treatments.button.kind==='button')vocabulary.treatments.button.radius=p.button.radius;
  if(p.highlight&&vocabulary.treatments.marker.kind==='highlight')Object.assign(vocabulary.treatments.marker,p.highlight);
  const add=(id:string,svg:string,kind:'pattern'|'icon')=>{try{vocabulary.icons[id]={kind,shape:approvedVector(svg,palette)};}catch(error){warnings.push(`${id}: ${error instanceof Error?error.message:'Invalid vector'}`);}};
  if(p.patternSvg)add('brand-pattern',p.patternSvg,'pattern');for(const icon of p.icons??[])add(icon.id,icon.svg,'icon');
 }}
 if(override!==undefined){const result=graphicVocabularySchema.safeParse(override);if(!result.success)warnings.push('Invalid graphic vocabulary override; using defaults.');else{
  const allowed=new Set(palette.flatMap(c=>[c.id,c.hex.toLowerCase()]));
  const valid=(value:unknown,key=''):boolean=>typeof value==='string'?(!['fill','on','color','bg','stroke'].includes(key)||value==='currentColor'||allowed.has(value)||allowed.has(value.toLowerCase())):Array.isArray(value)?value.every(v=>valid(v,key)):value&&typeof value==='object'?Object.entries(value).every(([k,v])=>valid(v,k)):true;
  if(!valid(result.data))warnings.push('Graphic override uses colours outside the palette; using defaults.');else Object.assign(vocabulary,result.data);
 }}
 return {vocabulary,warnings};
}
