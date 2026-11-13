// Chat-shaped plan C4: digests between stages. Built by rule from recorded inputs; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {plainText,stageDigest,stageFull,DIGEST_MAX_CHARS} from '../packages/director/digest';
import {designerDigestText,designerDigestEntries,usesDigest,assetNames} from '../packages/director/designer-digest';
import {designerContext} from '../packages/director/designer-context';
import {readDesignerTurn} from '../packages/director/designer';
import {withCreativeHandoff} from '../packages/director/creative-handoff';
import {prepareTextRequest} from '../packages/agents/prepared-request';
import {textRequestQuote} from '../packages/agents/text-quote';
import type {DirectionInput} from '../packages/director/types';
import type {CreativeHandoff} from '../packages/director/creative-handoff';

const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,HEX=/\b[0-9a-f]{40,}\b/i;
const strategyOutput={schemaVersion:'1.0',role:'strategy',status:'draft',summary:'Three territories for musicians who lose takes.',inputRefs:['a1b2'],deliverable:{strategicBrief:'Musicians lose their best take in a mess of files.',threeTerritories:[{id:'territory-1',name:'Every take kept',promise:'Nothing you play is lost.',creativeIdea:'The session as an archive you can walk through.',hook:'Lost your best take?',hypothesis:'h',measurementPlan:'m',invalidation:'i',evidenceId:'5dc9f303-340d-41b8-b183-7cd258a062d8'}],channelRationale:'Feeds where musicians share work.'},assumptions:['A'],handoff:{nextRole:'script',requiredInputs:[],checks:[]}};
const handoff=(i:DirectionInput):CreativeHandoff=>({version:1,owner:'draft-director',revision:'f'.repeat(64),
 intent:{goal:'Sign-ups',audience:'Home-studio musicians',adNotes:null,creativeFocus:'Show the files, not the band.',feeling:'Calm, exact.',direction:{id:'concept-2',name:'Every take kept',premise:'The session as an archive.',world:['Track names: Bass DI v3','Session: Night demo']}},
 strategy:{selected:[{path:'/threeTerritories/0',evidence:{name:'Every take kept',promise:'Nothing you play is lost.',contentHash:'a'.repeat(64)}}],sharedSource:'s'},
 visual:{treatments:[{conceptId:'concept-2',visualIdea:'Waveforms stacked like a library.',makingTechnique:'Code-built interface with one photo.',composition:'One object, large.',sources:[{id:'x',hash:'b'.repeat(64)}]}]},
 sources:[{id:'7c1d2e3f-4a5b-4c6d-8e7f-901234567890',role:'strategy',hash:'c'.repeat(64),contentHash:'d'.repeat(64),raw:JSON.stringify(strategyOutput)}],referenceAssetIds:[i.assets[1].id],issues:['Visual source is shared prose.'],actions:['Kept the fragments.']});
const input=(flags:Record<string,unknown>={designerVersion:3,materialsVersion:1,digestVersion:1})=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,...flags};i.creativeHandoff=handoff(i);return i;};

test('C4: a stage digest is plain labelled text built by rule: no ids, hashes, provenance, sources, issues or actions', ()=>{
 const d=stageDigest(JSON.stringify(strategyOutput));
 assert.match(d,/^Summary: Three territories/);assert.match(d,/Three territories:\n  1\.\n    Name: Every take kept/);assert.match(d,/Creative idea: The session as an archive/);
 for(const leak of ['territory-1','5dc9f303','a1b2','Handoff','Schema version','Evidence id'])assert.ok(!d.includes(leak),leak);
 assert.equal(stageDigest(JSON.stringify(strategyOutput)),d,'deterministic');
 const long={deliverable:{items:Array.from({length:400},(_,n)=>({claim:`Claim ${n} `+'x'.repeat(80)}))}};
 const short=stageDigest(long);assert.ok(short.length<=DIGEST_MAX_CHARS+80);assert.match(short,/more in the full output, available by name\)$/);
 assert.ok(stageFull(long).length>short.length,'the full output is longer, still plain text');
 assert.equal(plainText({sources:[1],issues:['x'],actions:['y'],provenance:{a:1},sha256:'e'.repeat(64),note:'kept'}),'Note: kept');
});

test('C4: the designer\'s first turn holds the digest: no raw planning source, no hash, no id other than scene and format names', ()=>{
 const i=input(),text=designerDigestText(i),scenes=new Set(i.storyboard.map(s=>s.id));
 assert.ok(!HEX.test(text),'no hash');assert.deepEqual([...new Set(text.match(UUID)??[])].filter(id=>!scenes.has(id)),[],'the only ids are the scenes the code uses');
 for(const leak of ['"deliverable"','threeTerritories','contentHash','Visual source is shared prose','Kept the fragments','Sources','territory-1','{"'])assert.ok(!text.includes(leak),leak);
 assert.match(text,/CREATIVE FOCUS[^\n]*\nShow the files, not the band\./);assert.match(text,/HERO SCENE\nScene 1 \(id /);assert.match(text,/vertical · 1080×1920 · REFERENCE/);
 assert.match(text,/REFERENCE COPY \(en-GB, hook primary/);assert.match(text,/Scene 1: LOST TRACK OF YOUR BEST TAKE\?/);
 assert.match(text,/VISUAL DIRECTION \(in short\)\nTreatments:\n  1\.\n    Visual idea: Waveforms stacked like a library\./);assert.match(text,/STRATEGY \(in short\)/);
 assert.match(text,new RegExp(`${assetNames(i)[1].name.replace(/[.()]/g,'\\$&')} · image/png · use it`),'supplied files by name');
 assert.equal(designerDigestText(input()),text,'deterministic');
 // The full copy table (every hook and language) is not in the first turn: it is a catalogue entry.
 const table=designerDigestEntries(i).find(e=>e.name==='copy-table')!;assert.match(table.detail!,/  primary · en-GB: LOST TRACK/);assert.ok(!/ · en-GB: /.test(text));
 assert.deepEqual(designerDigestEntries(i).map(e=>e.name),['stage-strategy','stage-scenario','stage-visual-direction','copy-table']);
 // Before and after, characters ÷ 4 (the recorded input of a real run; its kit is small, see the review).
 const before=Math.ceil(JSON.stringify({input:designerContext(i)}).length/4),after=Math.ceil(text.length/4);assert.ok(after<before/3,`${after} vs ${before}`);
});

test('C4: the digest is plain text in the request, counted in the quote; earlier blocks keep the JSON context', ()=>{
 const text='DIRECTION: x\nLine two',cfg={instructions:'i',maxOutputTokens:100,pricing:{inputPrice:1e-6,outputPrice:1e-6},campaignContext:{checkpointId:'c'},contextText:text};
 const p=prepareTextRequest('m','task',cfg),user=p.messages.find(m=>m.role==='user')!.content as string;
 assert.ok(user.includes(`CAMPAIGN CONTEXT (untrusted source data):\n${text}\n`),'verbatim, not a JSON string');assert.ok(!user.includes('checkpointId'));
 assert.ok(textRequestQuote('task',cfg).inputTokenBound>textRequestQuote('task',{...cfg,contextText:undefined}).inputTokenBound);
 const old=input({designerVersion:3}),both=input({designerVersion:3,materialsVersion:1});
 assert.equal(usesDigest(old),false);assert.equal(usesDigest(both),false,'digest needs its own flag');assert.equal(usesDigest(input()),true);
 assert.match(withCreativeHandoff(input(),'director','I'),/given in your input/);assert.match(withCreativeHandoff(old,'director','I'),/selected creativeHandoff treatment/,'earlier blocks keep their exact text');
});

test('C4: the designer refers to supplied files by name; the app maps names back to ids', ()=>{
 const i=input(),name=assetNames(i)[1].name,scene=i.storyboard[0].id;
 const turn=readDesignerTurn({focus:{sceneId:scene,activity:'designing',about:'x'},pictures:[{purpose:'p',scene,prompt:'a photo',aspect:'1:1',referenceAssetIds:[name]}]},i);
 assert.deepEqual(turn.pictures[0].referenceAssetIds,[i.assets[1].id]);
 assert.throws(()=>readDesignerTurn({focus:{sceneId:scene,activity:'designing',about:'x'},pictures:[{purpose:'p',scene,prompt:'a photo',aspect:'1:1',referenceAssetIds:[name]}]},input({designerVersion:3})),/DESIGNER_UNKNOWN_REFERENCE/,'earlier blocks: ids only');
});
