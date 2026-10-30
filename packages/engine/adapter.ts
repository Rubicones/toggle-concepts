import {graphicDefaults} from '../brand/graphic-vocabulary';
import type {BrandSystem} from '../contracts/creative-drafts';
import type {Kit} from './types';
/** The port's Kit stays internal. All product-facing numbers come from BrandSystem. */
export function brandToKit(brand:BrandSystem):Kit{
 const defaults=graphicDefaults(brand.palette);
 const color=(role:string)=>brand.palette.find(c=>c.roles.includes(role as never))?.id??brand.palette[0].id;
 return {schema:'ad/kit@2',brand:brand.product.name,version:1,
 colors:Object.fromEntries(brand.palette.map(c=>[c.id,{hex:c.hex,roles:c.roles.map(r=>r==='ink'?'text':r)}])),sketch_palette:brand.palette.map(c=>c.id),object_palette:brand.palette.map(c=>c.id),
 fonts:Object.fromEntries(brand.fonts.map(f=>[f.role,{family:f.family,fallback:'',measure:f.role,files:f.files.map(file=>({weight:file.weight,file:file.objectKey}))}])),
 logos:Object.fromEntries(brand.logos.map(l=>[l.id,{file:l.objectKey,svg:l.svg??'',raster_mask:!!l.svg&&/\b(?:transform|opacity|fill-opacity|stroke-opacity)\s*=/i.test(l.svg),mode:l.svg?l.mode:'as_drawn',ground:l.ground,role:l.role==='icon'?'icon':'primary',view_box:l.viewBox?[l.viewBox[2],l.viewBox[3]]:[4,1]}])),
 logo_rules:{default:brand.logos[0]?.id??'',width_u:[18,28],colors:[color('ink')],never:['distort','substitute']},
 styles:Object.fromEntries(Object.entries(brand.styles).map(([key,s])=>[key,{font:s.font,size:s.sizeU[1]*10.8,weight:s.weight,pitch:s.lineHeight,tracking:s.tracking,case:s.case,treatment:key==='cta'?'button':key==='subhead'?'plaque':key==='headline'?'marker':'plain'}])),
 treatments:{...defaults.treatments,...brand.treatments},marks:brand.marks??{},graphics:brand.icons??{},paints:{...defaults.paints,...brand.paints},
 ui_kit:{frame:color('ink'),screen:color('field'),text:color('ink'),muted:color('ink'),accent:color('accent'),positive:color('accent'),surface:color('surface'),line:color('ink'),field_style:'filled',radius:24,font:'body'},
 layout:{margin_side_u:5,margin_top_u:5,gap_region_u:3,min_text_scale:Math.min(...Object.values(brand.styles).map(s=>s.sizeU[0]/s.sizeU[1])),region_floor_u:20},contrast:{flat:3,media:3,exceptions:[]},
 motion:{curves:{out3:brand.motion.easing,inout:[.4,0,.2,1]},allowed:brand.motion.allowedCues,forbidden:[],never:[],character:'brand',durations:brand.motion.durations},
  markets:{},reading:{per_word_s:5/brand.limits.readingCps,base_s:0},object_lock:{},object_check:{},look:{treatment:brand.imagery.treatment},voice:brand.voice,legal:{claims:[],mandatory:[]},
 sketch_reading:{snap_u:.5,question_u:2},product:{name:brand.product.name,description:'',photos:brand.product.media,must_not:brand.product.immutables},
 limits:{hook_words:brand.limits.hookWords,hook_lines:2,cta_words:brand.limits.ctaWords,colors_max:brand.limits.colorsMax,moving_max:brand.motion.movingMax,offer_by_s:brand.limits.offerByS,beats_max:8},compositions:brand.compositions as Kit['compositions']};
}
