import type {BrandSystem,CreativeRepair} from '../contracts/creative-drafts';
import type {CreativeDirection,FrameProgram} from '../contracts/frame-program';
import {contrastRatio} from '../engine/engine/util';

/**
 * Free L0 layout repair driven by the engine's own measurements: after a local build, unreadable colours and
 * overlapping layers reported for a scene are fixed in that scene and the direction is rebuilt (bounded rounds).
 * Only colour and zone choices change. Unresolved overlaps stay blocked; required layers are never deleted.
 */
export function autoFixLayout(direction:CreativeDirection,brand:BrandSystem,compileAll:(d:CreativeDirection)=>FrameProgram[],rounds=3):{direction:CreativeDirection;programs:FrameProgram[];log:CreativeRepair[]}{
 const d=structuredClone(direction);let programs=compileAll(d);const log:CreativeRepair[]=[];
 const note=(path:string,code:string,action:string)=>log.push({direction:d.script.direction,level:'L0',path,code,action,costMicroUsd:0,attempt:0});
 for(let round=0;round<rounds;round++){
  const blocks=programs.flatMap(p=>p.engine.issues).filter(i=>i.severity==='block');if(!blocks.length)break;
  let changed=false;const done=new Set<string>();
  for(const issue of blocks){
   const beat=d.scenes.beats.find(b=>issue.path.startsWith(`scenes.beats.${b.key}.layers.`));if(!beat)continue;
   const layer=[...beat.layers].sort((a,b)=>b.key.length-a.key.length).find(l=>issue.path===`scenes.beats.${beat.key}.layers.${l.key}`||issue.path.startsWith(`scenes.beats.${beat.key}.layers.${l.key}.`)),id=`${issue.code}:${beat.key}:${layer?.key}`;if(!layer||done.has(id))continue;done.add(id);
   if(issue.code==='L_CONTRAST'){
    const ground=issue.message.match(/ on (#[0-9a-f]{6})/i)?.[1];if(!ground)continue;
    const best=[...brand.palette].sort((a,b)=>contrastRatio(b.hex,ground)-contrastRatio(a.hex,ground))[0],current=brand.palette.find(c=>c.id===layer.color)?.hex;
    if(best&&best.id!==layer.color&&(!current||contrastRatio(best.hex,ground)>contrastRatio(current,ground))){layer.color=best.id;changed=true;note(`scenes.beats.${beat.key}.layers.${layer.key}`,'L_CONTRAST',`Switched to ${best.id} for contrast on ${ground}.`);}
   }else if(issue.code==='L_REGION'&&/-ground\b/.test(issue.message)&&layer.kind==='text'){
    // Text straddling the edge of a picture card: move it to a free copy zone, else give the line its own box so it reads as one block.
    const zones=['text','cta'].filter(z=>brand.compositions.find(c=>c.id===beat.composition)?.zones[z]&&z!==layer.zone&&!beat.layers.some(l=>l!==layer&&l.zone===z));
    if(zones.length){layer.zone=zones[0];changed=true;note(`scenes.beats.${beat.key}.layers.${layer.key}`,'L_REGION',`Moved text to the ${zones[0]} zone, clear of the picture edge.`);}
    else if(!layer.treatment&&brand.treatments&&Object.entries(brand.treatments).find(([,t])=>t.kind==='box'||t.kind==='plaque')){const [id]=Object.entries(brand.treatments).find(([,t])=>t.kind==='box'||t.kind==='plaque')!;layer.treatment=id;changed=true;note(`scenes.beats.${beat.key}.layers.${layer.key}`,'L_REGION',`Set the ${id} treatment so the line reads over the picture edge.`);}
   }else if(issue.code==='L_ZONE'){
    // Move text to a free copy zone without removing scenario elements.
    const zones=['text','cta'].filter(z=>brand.compositions.find(c=>c.id===beat.composition)?.zones[z]&&z!==layer.zone&&!beat.layers.some(l=>l!==layer&&l.zone===z&&l.kind!=='text'));
    if(layer.kind==='text'&&zones.length){layer.zone=zones[0];changed=true;note(`scenes.beats.${beat.key}.layers.${layer.key}`,'L_ZONE',`Moved text to the ${zones[0]} zone, clear of platform UI.`);}
   }else if(issue.code==='L_OVERLAP'){
    const other=beat.layers.find(l=>l.key===issue.message.match(/ and (\S+) overlap/)?.[1])??beat.layers.find(l=>new RegExp(`(device|object) ${l.key}\\b`).test(issue.message));
    const pair=[layer,other].filter((l):l is NonNullable<typeof l>=>!!l);
    const textZones=['text','cta'].filter(z=>brand.compositions.find(c=>c.id===beat.composition)?.zones[z]);
    const text=pair.find(l=>l.kind==='text'),logo=pair.find(l=>l.kind==='logo');
     const logoZone=brand.compositions.find(c=>c.id===beat.composition)?.zones.logo;
     if(logo&&logoZone&&logo.zone!=='logo'&&!beat.layers.some(l=>l!==logo&&l.zone==='logo')){logo.zone='logo';changed=true;note(`scenes.beats.${beat.key}.layers.${logo.key}`,'L_OVERLAP','Moved the logo to its own logo zone.');continue;}
     if(text&&logo&&beat.layers.filter(l=>l.kind==='logo').length===1){const free=textZones.find(z=>z!==text.zone&&!beat.layers.some(l=>l!==text&&l.zone===z));if(free){text.zone=free;changed=true;note(`scenes.beats.${beat.key}.layers.${text.key}`,'L_OVERLAP',`Moved text to the ${free} zone.`);continue;}}
     if(text&&other&&other.kind!=='text'&&logo===undefined){const free=textZones.find(z=>z!==text.zone&&!beat.layers.some(l=>l!==text&&l.zone===z));if(free){text.zone=free;changed=true;note(`scenes.beats.${beat.key}.layers.${text.key}`,'L_OVERLAP',`Moved text off the visual to the ${free} zone.`);continue;}}
    // Keep unresolved elements and their issue for the scene owner to repair.
   }
  }
  if(!changed)break;programs=compileAll(d);
 }
 return {direction:d,programs,log};
}
