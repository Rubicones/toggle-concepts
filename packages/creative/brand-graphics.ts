import type {CreativeDirection} from '../contracts/frame-program';
import type {BrandSystem} from '../contracts/creative-drafts';
/** Complete the end lockup using approved copy and supplied artwork. Never generate branding. */
export function completeBrandGraphics(source:CreativeDirection,brand:BrandSystem):CreativeDirection{
 const d=structuredClone(source);
 for(const beat of d.script.beats){
  if(!['cta','offer'].includes(beat.role))continue;
  const scene=d.scenes.beats.find(s=>s.key===beat.key);if(!scene)continue;
  const copy=d.script.copy.filter(c=>c.beat===beat.key),logo=beat.elements.find(e=>e.kind==='logo');
  // A generic 'logo and offer' placeholder duplicates the real logo and approved offer layers.
  for(const element of [...beat.elements])if(element.kind==='graphic'&&/logo.*offer|offer.*logo/i.test(element.what)&&logo&&scene.layers.some(l=>l.element===logo.key)&&copy.some(c=>/offer|free|month|trial/i.test(c.text)&&scene.layers.some(l=>l.kind==='text'&&l.source===c.key))){
   const removed=new Set(scene.layers.filter(l=>l.element===element.key).map(l=>l.key));
   scene.layers=scene.layers.filter(l=>l.element!==element.key);scene.cues=scene.cues.filter(q=>!removed.has(q.target));scene.never=scene.never.filter(id=>!removed.has(id));beat.elements=beat.elements.filter(e=>e!==element);if(beat.focal===element.key)beat.focal=scene.layers.find(l=>l.kind==='text'&&copy.some(c=>c.key===l.source&&c.slot==='cta'))?.element??logo.key;
  }
  if(!logo&&brand.logos[0]){
   const key=`brand_${beat.key}`,id=`lockup_${beat.key}`;
   beat.elements.push({key,kind:'logo',what:'Approved logo lockup'});
   scene.layers.push({key:id,element:key,kind:'logo',zone:'logo',order:scene.layers.length,style:'body',color:brand.palette.find(c=>c.roles.includes('ink'))?.id??brand.palette[0].id,source:brand.logos[0].id,registryId:''});
   d.media.elements.push({element:key,source:'logo',reference:brand.logos[0].id,fit:'contain',ground:d.treatment.palette.field,promptPack:null,ui:null,contract:null});
  }
  for(const layer of scene.layers)if(layer.kind==='text'&&copy.some(c=>c.key===layer.source&&c.slot==='cta'))layer.treatment='button';
 }
 return d;
}
