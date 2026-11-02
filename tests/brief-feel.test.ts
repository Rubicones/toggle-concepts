import {test} from 'node:test';
import assert from 'node:assert/strict';
import {briefDraftSchema,emptyBrief} from '../packages/contracts/brief';
import {briefFeelSchema,compileFeelingBrief,brandTokensFromKit,feelings,lookOptions,SUGGEST} from '../packages/contracts/brief-feel';
import {planningTransportTask} from '../packages/contracts/localization';
import {liveCriticInstructions} from '../packages/agents/prompts/director-critic-v1';

test('earlier briefs stay valid and the new answers are optional',()=>{
 const base=emptyBrief() as Record<string,unknown>;
 assert.equal(briefDraftSchema.safeParse(base).success,true);
 const v2={...base,goal:'sign-ups',benefit:'Find your best take in seconds.',proof:'Every version is saved with its bars.',audienceAwareness:'knows-category',platforms:['meta','tiktok'],feel:{feelings:['creative-freedom','calm-confidence'],medium:'digital',character:{temperature:4},light:[SUGGEST],avoid:['stock','ai-look']},synthesisChoices:['backgrounds','abstract-light']};
 assert.equal(briefDraftSchema.safeParse(v2).success,true);
 assert.equal(briefDraftSchema.safeParse({...v2,feel:{feelings:['warmth','craft','play','bold']}}).success,false,'at most three feelings');
 assert.equal(briefDraftSchema.safeParse({...v2,feel:{character:{temperature:7}}}).success,false);
 const empty=briefFeelSchema.parse({});assert.equal(empty.stretch,SUGGEST);assert.equal(empty.medium,SUGGEST);assert.deepEqual(empty.feelings,[]);
});

test('every single choice offers suggest and the catalogue covers digital brands without live imagery',()=>{
 for(const key of ['stretch','medium','energy','colour','typeRole','productRole','people','textAmount','humour'] as const)assert.equal(briefFeelSchema.shape[key].parse(undefined),SUGGEST,key);
 const worlds=lookOptions.world.map(w=>w.id);for(const id of ['motion-graphics','object-3d','product-interface','typography-led','data-diagrams'])assert.ok(worlds.includes(id as never),id);
 assert.equal(feelings.length,12);
 assert.doesNotMatch(JSON.stringify([feelings,lookOptions]),/[Ѐ-ӿ]/,'no Russian text in the client questionnaire');
});

test('the feeling brief is compact, explicit about suggest, and lets the brand kit win',()=>{
 const kit={payload:{rules:[{category:'voice',key:'tone',value:'Direct, never decorative.',decision:'accepted'},{category:'voice',key:'samples',value:'"Every take, every version."',decision:'accepted'},{category:'color',key:'accent',value:'#DFFF00',decision:'accepted'},{category:'voice',key:'character',value:'rejected idea',decision:'rejected'}]}};
 const tokens=brandTokensFromKit(kit);assert.equal(tokens['voice.tone'],'Direct, never decorative.');assert.equal(tokens['voice.character'],undefined);
 const brief=compileFeelingBrief({benefit:'Find your best take in seconds.',feel:{feelings:['creative-freedom','calm-confidence'],medium:'digital',stretch:'fresh',character:{volume:2},avoid:['stock'],likes:[{aspects:['light'],note:'soft studio glow'}]}},tokens)!;
 assert.match(brief.text,/Main feeling: Creative freedom \(sensory hints:/);assert.match(brief.text,/Also: Calm confidence/);
 assert.match(brief.text,/imagery Digital: 3D, motion graphics, interface/);assert.match(brief.text,/light suggest/);
 assert.match(brief.text,/one direction at the brand core, two step aside/);assert.match(brief.text,/Quiet–Loud 2\/5/);
 assert.match(brief.text,/Avoid: Stock look/);assert.match(brief.text,/liked for Light/);assert.match(brief.text,/benefit: Find your best take/);
 assert.match(brief.text,/Brand kit \(wins over every choice above\): voice.tone: Direct, never decorative\./);assert.match(brief.text,/voice.samples/);
 assert.ok(brief.text.length<=1800);
 const blank=compileFeelingBrief({},{})!;assert.match(blank.text,/not chosen; derive it from the brand character/);assert.match(blank.text,/no voice or imagery rules accepted yet/);
 const long=compileFeelingBrief({feel:{feelings:['warmth','craft','play'],endFeeling:'x'.repeat(300),avoidNote:'y'.repeat(500),peopleNote:'z'.repeat(300),likes:[{note:'n'.repeat(300),aspects:['colour','light','type']},{note:'m'.repeat(300),aspects:[]}]},proof:'p'.repeat(600),audienceTension:'t'.repeat(600)},{'voice.tone':'v'.repeat(2000),'voice.samples':'s'.repeat(2000),'imagery.treatment':'i'.repeat(2000)})!;
 assert.ok(long.text.length<=1800);
});

test('planning contracts read the brand and the feeling brief first and never list stock ad formats',()=>{
 for(const role of ['strategy','script','visual-direction'])assert.match(planningTransportTask(role),/READ THE BRAND FIRST: campaignContext.feelingBrief/,role);
 const all=['strategy','script','visual-direction'].map(r=>planningTransportTask(r)).join('\n');
 assert.doesNotMatch(all,/UI Card Proof|Studio Still Life|POV Lifestyle|Tactile Material Craft|highlight strips or signature accent|architectural color-block split/);
 assert.doesNotMatch(all,/Get paid for buying milk|TEST THE HOOK BEFORE IT'S DONE/,'no other brand copy as examples');
 assert.match(planningTransportTask('strategy'),/How far from the usual style/);assert.match(planningTransportTask('strategy'),/digital means worlds built from 3D, motion graphics, interface and type/);
 assert.match(planningTransportTask('script'),/one decisive frame with one focal point and visible proof/);assert.match(planningTransportTask('script'),/brand's voice/);
 assert.match(planningTransportTask('visual-direction'),/square master/);assert.match(planningTransportTask('visual-direction'),/kit's shape language/);
 assert.match(liveCriticInstructions,/feels like the chosen feeling/);
});

test('guided planning gets the feeling brief from the stored brand revision (payload.kit.rules), accepted rules only',async()=>{
 const {withFeelingBrief,brandTokensFromKit}=await import('../packages/contracts/brief-feel');
 const revision={id:'r',payload:{kit:{rules:[{category:'voice',key:'tone',value:'Direct, warm',decision:'accepted'},{category:'voice',key:'character',value:'proposed only',decision:'proposed'}]}}};
 assert.deepEqual(brandTokensFromKit(revision),{'voice.tone':'Direct, warm'});
 const ctx=withFeelingBrief<Record<string,unknown>>({submittedBrief:{questionnaire:{}},acceptedBrandKit:revision})!;
 assert.match(String(ctx.feelingBrief),/voice.tone: Direct, warm/);assert.doesNotMatch(String(ctx.feelingBrief),/proposed only/);
 assert.equal(withFeelingBrief({feelingBrief:'kept'})!.feelingBrief,'kept');assert.deepEqual(withFeelingBrief({mode:'manual'}),{mode:'manual'});
});
