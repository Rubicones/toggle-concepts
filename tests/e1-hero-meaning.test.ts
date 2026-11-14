// Plan E1 as amended (designerVersion 6): the hero task names the scene's meaning, the hero stage reads a hero-only
// digest, the hero render measures the reference words only, and what was left out arrives when stage E opens.
// Version 5 blocks keep their exact texts (pinned by hash). Pure functions; no model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {brands,benchInputV5} from '../scripts/bench/brands';
import {heroTask,heroBrief,heroBriefLine} from '../packages/director/hero-chat';
import {designerDigestText,restAfterHero} from '../packages/director/designer-digest';
import {stageEMechanics} from '../packages/director/extension-chat';
import {heroMeaning} from '../packages/director/designer';
import type {DirectionInput} from '../packages/director/types';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,16);
const v5=benchInputV5(brands.find(b=>b.id==='ostrava')!),v6={...v5,brief:{...v5.brief,designerVersion:6}} as DirectionInput;

test('E1: version 5 blocks keep their exact hero task, digests and stage E opening', ()=>{
 assert.equal(heroMeaning(v5),false);assert.equal(heroMeaning(v6),true);
 // Hashes of the texts as committed in 6d9b867 (before E1), for this bench input.
 assert.equal(sha(heroTask(v5)),'2b9cf3b2b6093c41');assert.equal(heroTask(v5,{pictures:4}),heroTask(v5),'the picture count is version 6 only');
 assert.equal(sha(designerDigestText(v5,{sceneIds:false})),'7c7e0785cfc52dd2');assert.equal(designerDigestText(v5,{sceneIds:false,heroOnly:true}),designerDigestText(v5,{sceneIds:false}),'heroOnly is version 6 only');
 assert.equal(sha(designerDigestText(v5)),'4eff8b2b8fc17095');assert.equal(sha(stageEMechanics(v5)),'116e27349ebd42e4');
 assert.ok(heroTask(v5).includes('Make Scene 1 of 3 as one finished frame in 1080×1080: ')&&designerDigestText(v5).includes('\n  Shows: '));
});

test('E1b: the version 6 hero task names the meaning, the proof and the words, and nothing about what the frame looks like', ()=>{
 const withProof={...v6,storyboard:v6.storyboard.map((s,i)=>i===0?{...s,proof:'Any file back within two hours.'}:s)} as DirectionInput,task=heroTask(withProof,{pictures:4}),b=heroBrief(withProof);
 assert.match(task,/^THE HERO FRAME\nMake Scene 1 of 3 as one finished frame in 1080×1080\. /);
 assert.ok(task.includes(`What it must make the viewer understand: ${b.meaning}\nWhat proves it: Any file back within two hours.\nIts approved words (en-GB), exactly as written, nothing added: "The file is somewhere." / "That is not an answer."`));
 assert.ok(task.includes('What the frame shows is yours to decide.'));
 assert.ok(task.includes('You may ask for up to 4 pictures in this direction')&&task.includes('arrives in a later message, not in the next render'));
 assert.ok(heroTask(v6,{pictures:0}).includes('No pictures are approved for this direction'));assert.ok(!heroTask(v6).includes('\nPICTURES\n'),'no count, no picture paragraph');
 assert.ok(!/Shows:|selected\(|VARIATIONS/.test(task));
 assert.equal(heroBriefLine(v6),'Key frame brief: what this scene must say. The file a partner needs today and nobody can find. Words: "The file is somewhere." / "That is not an answer."');
});

test('E1c: the hero-only digest holds the direction, the territory whole, the hero scene and the reference format only', ()=>{
 const digest=designerDigestText(v6,{sceneIds:false,heroOnly:true});
 for(const part of ['DIRECTION: ','GOAL AND AUDIENCE','THE TERRITORY OF THIS DIRECTION (whole;','THE HERO SCENE (Scene 1 of 3; the only scene you make now)','What it must make the viewer understand: ','Its approved words (en-GB), verbatim: The file is somewhere. / That is not an answer.','The ad\'s other moments, for its place only: Scene 2: ','FORMAT (the only size you make now)\nsquare · 1080×1080 · smallest text 32 px · safe area','BRAND IN CODE (from ./brand)','MORE ON REQUEST'])assert.ok(digest.includes(part),part);
 // Removed from stage H: other formats, variations, selected(props,…), "Shows:", the other scenes' words, ids, and the
 // visual direction in short (the territory is present and says it).
 for(const f of v6.formats.filter(x=>x.id!=='square'))assert.ok(!digest.includes(`${f.width}×${f.height}`)&&!new RegExp(`\\b${f.id}\\b`).test(digest),f.id);
 for(const gone of ['VARIATIONS','selected(','Shows:','REFERENCE COPY','Hooks:','Languages:','VISUAL DIRECTION (in short)','STRATEGY (in short)','copy-table','stage-scenario','FORMATS\n',v6.storyboard[1].copy[0],v6.storyboard[0].id])assert.ok(!digest.includes(gone),gone);
 assert.ok(digest.length<designerDigestText(v5,{sceneIds:false}).length*0.7,'smaller than the version 5 hero digest');
 // Without a territory the visual direction in short stays, so the designer is never left without a direction.
 const bare={...v6,creativeHandoff:v6.creativeHandoff?{...v6.creativeHandoff,visual:{look:'Warm paper white, one object.'},sources:[]}:undefined} as DirectionInput;
 if(!designerDigestText(bare,{sceneIds:false,heroOnly:true}).includes('THE TERRITORY'))assert.ok(designerDigestText(bare,{sceneIds:false,heroOnly:true}).includes('VISUAL DIRECTION (in short)'));
});

test('E1c: everything left out of stage H arrives once, when stage E opens', ()=>{
 const rest=restAfterHero(v6),opening=stageEMechanics(v6);
 assert.ok(opening.startsWith('THE REST OF THE AD (left out while you made the hero frame)\n'+rest+'\n\nHOW THE DRAFT WORKS FROM NOW ON'));
 for(const f of v6.formats)assert.ok(rest.includes(`${f.id} · ${f.width}×${f.height}`),f.id);
 for(const part of ['Scene 2 · ','Must make the viewer understand: ','REFERENCE COPY (en-GB','VARIATIONS (all read through selected(props,…) in code)','Hooks: primary, hook-1','Languages: en-GB, de-DE, tr-TR'])assert.ok(rest.includes(part),part);
 assert.ok(!rest.includes('Shows:'));assert.ok(opening.includes('COPY TABLE'));
 // The whole version 6 digest (a restarted conversation, the reviewers) names the scene lines for what they are.
 const whole=designerDigestText(v6);assert.ok(whole.includes('\n  Must make the viewer understand: ')&&!whole.includes('Shows:')&&whole.includes('VARIATIONS'));
});
