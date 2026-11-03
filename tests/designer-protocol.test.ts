// Designer pipeline plan, point 4a: the designer protocol, its turn contract and the block flag.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/input.json';
import {readDesignerTurn,designerTurnResponse,designerActivityLine,usesDesigner} from '../packages/director/designer';
import {designerInstructions,designerPrompt} from '../packages/agents/prompts/designer-v1';
import {staticCoderInstructions} from '../packages/agents/prompts/static-coder';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput} from '../packages/director/types';

const input=()=>structuredClone(recorded) as unknown as DirectionInput;
const scene=()=>input().storyboard[0].id;

test('only blocks quoted with the designer use it',()=>{
 const i=input();assert.equal(usesDesigner(i),false);i.brief={...i.brief,designerVersion:1};assert.equal(usesDesigner(i),true);
 assert.equal(usesDesigner({...i,stage:'motion'}),false);
});

test('a turn is read with issued ids only, and gives the designer a sentence it can act on',()=>{
 const i=input(),s=scene(),format=i.formats[0].id;
 const turn=readDesignerTurn({focus:{sceneId:s,activity:'designing',about:'  the opening   frame '},files:[{path:'Frame.tsx',source:'export default ()=>null;'}],render:{sceneId:s,formats:[format]},pictures:[{purpose:'Slab',scene:s,prompt:'An aluminium slab.',aspect:'1:1',becomes:'a 3D render'}]},i);
 assert.equal(turn.focus.about,'the opening frame');assert.deepEqual(turn.edits,[]);assert.equal(turn.pictures[0].becomes,undefined,'becomes belongs to stand-ins only');
 assert.throws(()=>readDesignerTurn({focus:{sceneId:'nope',activity:'designing',about:'x'},render:{sceneId:s,formats:[]}},i),/DESIGNER_UNKNOWN_SCENE/);
 assert.throws(()=>readDesignerTurn({focus:{sceneId:s,activity:'looking',about:'x'},render:{sceneId:s,formats:['tiktok-99']}},i),/DESIGNER_UNKNOWN_FORMAT/);
 assert.throws(()=>readDesignerTurn({focus:{sceneId:s,activity:'designing',about:'x'},pictures:[{purpose:'p',scene:s,prompt:'p',aspect:'1:1',referenceAssetIds:['missing']}]},i),/DESIGNER_UNKNOWN_REFERENCE/);
 assert.throws(()=>readDesignerTurn({focus:{sceneId:s,activity:'looking',about:'x'}},i),/DESIGNER_EMPTY_TURN/);
});

test('finish names every scene once; sound only with a supplied audio file',()=>{
 const i=input(),ids=i.storyboard.map(s=>s.id),intent='The frames show the product through something only it has, in the brand’s own system and type.';
 const all=ids.map(sceneId=>({sceneId,moment:'Key frame',motion:'It turns.',sound:'A hum.'}));
 const turn=readDesignerTurn({focus:{sceneId:ids[0],activity:'finishing',about:'done'},finish:{intent,scenes:all}},i);
 assert.equal(turn.finish!.scenes[0].sound,undefined);
 if(ids.length>1)assert.throws(()=>readDesignerTurn({focus:{sceneId:ids[0],activity:'finishing',about:'done'},finish:{intent,scenes:all.slice(1)}},i),/DESIGNER_FINISH_SCENES/);
 const audio=input();audio.assets=[...audio.assets,{...audio.assets[0],id:'voice',mime:'audio/wav'}];
 assert.equal(readDesignerTurn({focus:{sceneId:ids[0],activity:'finishing',about:'done'},finish:{intent,scenes:all}},audio).finish!.scenes[0].sound,'A hum.');
});

test('the timeline line reads as plain words',()=>{
 assert.equal(designerActivityLine({focus:{sceneId:'b',activity:'revising',about:'headline overlaps the waveform'}},id=>id==='b'?2:0),'Revising scene 2: headline overlaps the waveform');
 assert.equal(designerActivityLine({focus:{sceneId:'b',activity:'finishing',about:''}},()=>2),'Finishing the draft');
});

test('the protocol keeps principles, drops the per-format ban, and its schema is portable',()=>{
 assert.match(staticCoderInstructions,/No per-format compositions/);assert.doesNotMatch(designerInstructions,/No per-format compositions|dimension tables/);
 assert.doesNotMatch(designerInstructions,/for example|e\.g\.|such as/i,'no example styles for the agent to copy');
 for(const rule of [/physical world/,/stand-in/,/cutout/,/three revisions per scene/,/hard one/,/previewOptions/,/no ids/])assert.match(designerInstructions,rule);
 const schema=JSON.stringify(providerJsonSchema(designerTurnResponse.schema));
 assert.doesNotMatch(schema,/"(?:maxLength|minLength|pattern|maxItems)"/);assert.ok(schema.length<4000,`designer schema ${schema.length} chars`);
 assert.equal(designerPrompt.responseSchema.name,'designer_turn_v1');
});
