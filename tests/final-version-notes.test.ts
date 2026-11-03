// Designer pipeline plan, point 3: "In the final version" notes under every draft frame.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/input.json';
import admission from '../fixtures/director/static/admission-input.json';
import {readDesign,staticDesignResponseFor} from '../packages/director/contract';
import {finalVersionNotes,clientFinalNote} from '../packages/director/final-notes';
import {staticDirectorPrompt,staticDirectorInstructionsFor,imageMethodInstructions} from '../packages/agents/prompts/director-v1';
import {slimDirectorInput} from '../packages/director/inputs';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput,Resource} from '../packages/director/types';

const base=()=>({...structuredClone(recorded) as DirectionInput,resourceIds:['res-aaaaaa','res-bbbbbb','res-cccccc','res-dddddd']});
const withFlags=(flags:Record<string,unknown>)=>{const i=base();i.brief={...i.brief,imageMethodsVersion:1,resourceBindingVersion:1,...flags};return i;};
const notesInput=()=>withFlags({pictureRulesVersion:1,finalNotesVersion:1});
const scenes=()=>(recorded as unknown as DirectionInput).storyboard;
const still=(over:Partial<Resource>={}):Resource=>({id:'res-aaaaaa',kind:'still',proxy:false,resolution:'low',purpose:'Slab',scene:scenes()[0].id,prompt:'An aluminium slab on a dark plinth, low key light.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],...over});
const answer=(frame:Record<string,unknown>,resources:Resource[]=[still({proxy:true,proxyFor:'3d',becomes:'a 3D render of the slab turning slowly'} as Partial<Resource>)])=>({designDocument:'D'.repeat(100),keyFrames:scenes().map((s,i)=>({sceneId:s.id,moments:[{id:'m',description:'Moment'}],...(i===0?frame:{})})),resources});

test('notes are read, trimmed and kept only for blocks started with them',()=>{
 const long='The slab rises out of shadow and turns to face the camera while light sweeps across its edge. '.repeat(5);
 const design=readDesign(answer({motion:`  ${long}  `,sound:'A low hum.'}),notesInput());
 assert.equal(design.keyFrames![0].motion!.length,240,'a long note is trimmed, never a failed paid answer');
 assert.equal(design.keyFrames![0].sound,'A low hum.');assert.equal(design.resources[0].becomes,'a 3D render of the slab turning slowly');
 const old=readDesign(answer({motion:'Moves.'}),withFlags({pictureRulesVersion:1}));
 assert.equal('motion' in old.keyFrames![0],false);assert.equal('becomes' in old.resources[0],false);
});

test('the response schema offers notes to new blocks only, and sound only when an audio file is supplied',()=>{
 const n=staticDesignResponseFor(notesInput(),false),r=staticDesignResponseFor(notesInput(),true);
 assert.equal(n.name,'static_director_v4');assert.equal(r.name,'static_director_v4r');
 assert.match(JSON.stringify(n.schema),/"motion"/);assert.match(JSON.stringify(n.schema),/"becomes"/);assert.doesNotMatch(JSON.stringify(n.schema),/"sound"/);
 const audio=notesInput();audio.assets=[...audio.assets,{...audio.assets[0],id:'voice',mime:'audio/wav'}];
 assert.equal(staticDesignResponseFor(audio,false).name,'static_director_v4a');assert.match(JSON.stringify(staticDesignResponseFor(audio,false).schema),/"sound"/);
 assert.equal(staticDesignResponseFor(withFlags({finalNotesVersion:1}),false).name,'static_director_v4n','notes without the picture rules carry no cutout');
 assert.equal(staticDesignResponseFor(withFlags({pictureRulesVersion:1}),false).name,'static_director_v3','blocks without notes keep their schema');
 assert.equal(staticDesignResponseFor(notesInput(),false),n,'the same schema object, so request identities are stable');
});

test('director instructions: unchanged for earlier blocks; for new blocks one FINAL rule replaces the motion sentence',()=>{
 assert.equal(staticDirectorInstructionsFor({}),staticDirectorPrompt.instructions);
 const text=staticDirectorInstructionsFor({pictureRulesVersion:1,finalNotesVersion:1});
 assert.match(text,/FINAL\. keyFrames\[\]\.motion/);assert.doesNotMatch(text,/GSAP timelines|Say what the final adds/);assert.doesNotMatch(text,/sound/);
 assert.match(staticDirectorInstructionsFor({pictureRulesVersion:1,finalNotesVersion:1},true),/sound: what is heard/);
 assert.match(staticDirectorInstructionsFor({finalNotesVersion:1}),/never a screenshot or a still/,'without the picture rules the interface sentence stays whole');
});

test('the 128-variant director request with both rules still fits with one reference image',()=>{
 const input={...structuredClone(admission) as unknown as DirectionInput};input.brief={...input.brief,imageMethodsVersion:1,pictureRulesVersion:1,finalNotesVersion:1};const schema=staticDesignResponseFor(input,false);
 const result=compactDraftRequest(staticDirectorPrompt.prompt,{instructions:staticRoleInstructions.director,protocolInstructions:staticDirectorInstructionsFor(input.brief)+imageMethodInstructions(false),responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded',input:slimDirectorInput(input)},pricing:{inputPrice:3e-6,outputPrice:15e-6},maxOutputTokens:6000,cachePrompt:true},Array.from({length:6},()=>({url:'fixture-reference',label:'Supplied picture'})));
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP);assert.equal(result.images.length,1);
});

test('notes per scene: stand-ins, motion and sound in plain sentences, without ids; empty scenes are omitted',()=>{
 const input=notesInput(),[first,second]=scenes();
 const design=readDesign(answer({motion:'the slab res-aaaaaa rises out of shadow and turns',sound:'A low hum.'},[
  still({proxy:true,proxyFor:'3d',becomes:'the slab turning slowly'} as Partial<Resource>),
  still({id:'res-bbbbbb',proxy:true,proxyFor:'video',scene:first.id,becomes:'A filmed shot of a hand lifting the slab'} as Partial<Resource>),
  still({id:'res-cccccc',scene:first.id,becomes:'ignored: not a stand-in'} as Partial<Resource>),
 ]),input);
 const notes=finalVersionNotes(design,input);
 assert.equal(notes.length,1,'a scene with nothing to add shows nothing');assert.equal(notes[0].sceneId,first.id);assert.ok(!notes.some(n=>n.sceneId===second?.id));
 assert.deepEqual(notes[0].pictures,[{kind:'3d',text:'A 3D render of the slab turning slowly.'},{kind:'video',text:'A filmed shot of a hand lifting the slab.'}]);
 assert.equal(notes[0].motion,'The slab rises out of shadow and turns.');
 assert.equal(notes[0].sound,undefined,'no audio file, so no sound in the final');
 const audio=notesInput();audio.assets=[...audio.assets,{...audio.assets[0],id:'voice',mime:'audio/wav'}];
 assert.equal(finalVersionNotes(readDesign(answer({sound:'a low hum'}),audio),audio)[0].sound,'A low hum.');
 assert.deepEqual(finalVersionNotes(design,withFlags({pictureRulesVersion:1})),[],'earlier blocks show no panel');
});

test('the client reads the same plan without technical words',()=>{
 const note={sceneId:'s',pictures:[{kind:'3d' as const,text:'A 3D render of the slab turning slowly.'}],motion:'The waveform assembles bar by bar.'};
 assert.deepEqual(clientFinalNote(note),{pictures:['This picture becomes a 3D render of the slab turning slowly.'],motion:'The waveform assembles bar by bar.'});
});
