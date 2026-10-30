import test from 'node:test';
import assert from 'node:assert/strict';
import {lockStoryboard,storyboardPinned} from '../packages/creative/storyboard-align';
import {storyboardMotion,recipeSpecs,recipeNames} from '../packages/creative/motion-recipes';
import {legibleOverMedia} from '../packages/creative/quality.local';
import type {ScriptSpecV2} from '../packages/contracts/creative-drafts';
import type {DirectionProgram} from '../packages/contracts/frame-program';

function script():ScriptSpecV2{
 return {version:'script@2',direction:0,oneLine:'x',data:[],hooks:[{hookAxisId:'h0',angle:'a',beat:'b0'}],
  sourceScenes:[{sceneId:'scene-1',startTime:0,endTime:2,visualNotes:'Energetic montage of musicians in a rehearsal space, quick cuts.',onScreenCopy:'YOUR BAND. YOUR TRACKS.',narration:''},
   {sceneId:'scene-2',startTime:2,endTime:3,visualNotes:'Fast cut back to musicians nodding in agreement, then the logo and offer.',onScreenCopy:'FREE MONTH. SIGN UP.',narration:''}],
  beats:[{key:'b0',role:'hook',objective:'',focal:'e0',sourceSceneIds:['scene-1'],elements:[{key:'e0',kind:'text',what:'hook'},{key:'e1',kind:'media',what:'Montage of musicians'}]},
   {key:'b1',role:'cta',objective:'',focal:'e2',sourceSceneIds:['scene-2'],elements:[{key:'e2',kind:'text',what:'cta'},{key:'e3',kind:'ui',what:'Seamless navigation through the app UI'}]}],
  copy:[{key:'c0',beat:'b0',slot:'hook',locale:'en-GB',text:'Stop losing track.',short:['Stop.']},{key:'c1',beat:'b1',slot:'cta',locale:'en-GB',text:'Sign up',short:[]},{key:'c2',beat:'b1',slot:'body',locale:'en-GB',text:'Free month',short:[]}],
  cutdowns:[{durationSeconds:3,beats:['b0','b1'],beatSeconds:[2,1]}]} as unknown as ScriptSpecV2;
}

test('approved storyboard copy replaces an agent line and is pinned against the budget',()=>{
 const s=script(),actions=lockStoryboard(s);
 assert.equal(s.copy.find(c=>c.key==='c0')!.text,'YOUR BAND. YOUR TRACKS.');assert.deepEqual(s.copy.find(c=>c.key==='c0')!.short,[]);
 assert.ok(actions.some(a=>/scene-1/.test(a)));
 // "Free month" + "Sign up" already carry scene 2's words: nothing is added there.
 assert.equal(s.copy.filter(c=>c.beat==='b1').length,2);
 assert.ok(storyboardPinned(s,'YOUR BAND. YOUR TRACKS.'));assert.ok(!storyboardPinned(s,'Stop losing track.'));
});

test('a storyboard subject the beat does not show takes over an unrelated visual, never a needed one',()=>{
 const s=script();lockStoryboard(s);
 const e3=s.beats[1].elements.find(e=>e.key==='e3')!;assert.equal(e3.kind,'media');assert.match(e3.what,/musicians nodding/);assert.doesNotMatch(e3.what,/logo/);
 assert.equal(s.beats[0].elements.find(e=>e.key==='e1')!.what,'Montage of musicians','a beat that already shows its subject is untouched');
 assert.deepEqual(lockStoryboard(s),[],'idempotent');
});

test('transition words describe how a scene is entered; recipes are distinct choreographies',()=>{
 assert.equal(storyboardMotion('Fast cut back to musicians nodding').transitionIn,'cut');
 assert.equal(storyboardMotion('Seamless transition to a clean UI mockup').transitionIn,'crossfade');
 assert.equal(storyboardMotion('Musicians captured in dynamic, quick cuts').transitionIn,undefined);
 assert.equal(storyboardMotion('Musicians captured in dynamic, quick cuts').recipe,'montage-on-beat');
 const signatures=recipeNames.map(n=>JSON.stringify(recipeSpecs[n]));assert.equal(new Set(signatures).size,recipeNames.length);
});

test('text that measured unreadable over a photo gets a brand colour with headroom, else a brand box',()=>{
 const cfg={kit:{colors:{ink:{hex:'#F8F8F8',roles:[]},paper:{hex:'#070707',roles:[]}},contrast:{media:3,flat:4.5,exceptions:[]},treatments:{},styles:{body:{treatment:'plain'}}},
  beats:[{id:'edit0.b1',layers:[{id:'l1',kind:'text',style:'body',color:'ink',slot:'c1'}]},{id:'edit1.b1',layers:[{id:'l1',kind:'text',style:'body',color:'ink',slot:'c1'}]}]} as unknown as DirectionProgram['config'];
 assert.ok(legibleOverMedia(cfg,[{code:'L_CONTRAST',beat:'edit0.b1',element:'l1',message:'l1: contrast 1.10 (< 3) #F8F8F8 on #e0e0e0 (over media)'}]));
 assert.deepEqual(cfg.beats.map(b=>(b.layers[0] as {color:string}).color),['paper','paper'],'every edit of the scene changes');
 assert.ok(legibleOverMedia(cfg,[{code:'L_CONTRAST',beat:'edit0.b1',element:'l1',message:'l1: contrast 1.40 (< 3) #070707 on #808080 (over media)'}]));
 const layer=cfg.beats[0].layers[0] as {treatment?:string};assert.equal(layer.treatment,'legibility_paper');assert.equal(cfg.kit.treatments.legibility_paper.kind,'box');
});
