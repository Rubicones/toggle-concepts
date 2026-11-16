// The bench's chat baseline: one plain conversation, what it is sent, and its one repair turn. No model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {chatBaselineMessage,readChatAnswer,runChatBaseline,brandFactsFromPack,CHAT_BASELINE_SYSTEM,type ChatSend} from '../scripts/bench/chat-baseline';
import {brands,benchInputV5,benchBrandPack} from '../scripts/bench/brands';
import {prepareBrandWorkspace} from '../scripts/bench/export-files';
import {readSkills} from '../packages/agents/skill-files';
import {STAGE_H_INSTRUCTIONS} from '../packages/director/hero-chat';
import {IDEAS_TASK} from '../packages/director/image-ideas';
import type {DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {CatalogEntry} from '../packages/director/types';

const brask=brands.find(b=>b.id==='brask')!,input=benchInputV5(brask);
const png=(w:number,h:number)=>{const c=createCanvas(w,h);c.getContext('2d').fillRect(2,2,w-4,h-4);return c.toBuffer('image/png');};

test('chat baseline: the message is what a person would type, with nothing of the pipeline in it', ()=>{
 const message=chatBaselineMessage(input,{brand:benchBrandPack(brask),brandName:'Brask'},{logos:['brask-ink.svg'],supplied:['brask-casserole-ember.png']});
 for(const part of ['I need one finished ad frame, 1080×1080 pixels','THE PRODUCT AND THE BRIEF\nProduct: Brask makes one enamelled cast-iron casserole','Offer: Free delivery and 100 nights to cook with it','THE BRAND (Brask)','WHAT THIS FRAME MUST SAY\nThe viewer has bought the same pan three times','The words on the frame, exactly these and nothing else (en-GB): "The last pot" / "you will buy."','- brask-ink.svg (logo)','- brask-casserole-ember.png (our own picture: use it as it is)','Brask Serif (700)','One complete file in a code block named Frame.tsx',"it will be the file 'picture-1.png'"])assert.ok(message.includes(part),part);
 // No role, skill, stage instruction, ideas task, territory, reviewer or kit rule.
 for(const skill of readSkills())assert.ok(!message.includes(skill.title)&&!(skill.principles&&message.includes(skill.principles.slice(0,60))),skill.id);
 for(const gone of [STAGE_H_INSTRUCTIONS.slice(0,60),IDEAS_TASK.slice(0,40),'THE TERRITORY','Way of making','THREE IMAGE IDEAS','ROLE:','review','actions','./kit','./brand','resources['])assert.ok(!message.includes(gone),gone);
 assert.equal(CHAT_BASELINE_SYSTEM,'You are Claude, a helpful assistant.');assert.ok(message.length<4500,String(message.length));
 assert.equal(brandFactsFromPack('BRAND CHARACTER\nCalm.\n\nRULES\n- ink\n\nMATERIAL CATALOGUE (the brand\'s kit sections)\n- kit-logo'),'BRAND CHARACTER\nCalm.\n\nRULES\n- ink');
});
test('chat baseline: the answer is read as one file and, when asked, one picture', ()=>{
 const a=readChatAnswer('Here it is.\n\n```tsx Frame.tsx\nexport default function Frame(){return null;}\n```\n\n```picture\n{"prompt":"A linen cloth in daylight.","aspect":"4:5"}\n```');
 assert.equal(a.frame,'export default function Frame(){return null;}\n');assert.deepEqual(a.pictures,[{prompt:'A linen cloth in daylight.',aspect:'4:5'}]);
 assert.equal(readChatAnswer('```tsx\nconst x=1;\nexport default x;\n```').frame,'const x=1;\nexport default x;\n','a block without a name still counts');
 assert.deepEqual(readChatAnswer('No code.'),{pictures:[]});
});
test('chat baseline: one answer, one repair turn when it does not build, the same renderer, tokens and cost saved', async()=>{
 const root=await mkdtemp(join(tmpdir(),'chat-')),folder=join(root,'ws'),pub=join(folder,'public'),supplied=join(root,'supplied'),out=join(root,'out');await mkdir(pub,{recursive:true});await mkdir(supplied);
 await writeFile(join(supplied,'brask-casserole-ember.png'),png(64,64));await prepareBrandWorkspace(brask,pub,supplied);
 const shot=join(root,'shot.png');await writeFile(shot,png(32,32));
 const sent:{text:string;images:number;resume?:string}[]=[],bought:string[]=[];let builds=0;const written:string[]=[];
 const send:ChatSend=async(parts,resume)=>{sent.push({text:parts.filter(p=>p.type==='text').map(p=>(p as {text:string}).text).join('\n'),images:parts.filter(p=>p.type==='image').length,...(resume?{resume}:{})});
  return sent.length===1?{text:'```tsx Frame.tsx\nexport default 1;\n```\n```picture\n{"prompt":"Linen.","aspect":"1:1"}\n```',session:'s1',usage:{input_tokens:4000,output_tokens:3000},usd:0.3,seconds:40}:{text:'```tsx Frame.tsx\nexport default 2;\n```',session:'s1',usage:{input_tokens:500,cache_read_input_tokens:7000,output_tokens:2500},usd:0.5,seconds:30};};
 const tools=(real:DesignerTools):DesignerTools=>({...real,write:async(_p,s)=>{written.push(s);},build:async()=>++builds===1?{ok:false as const,issue:'Frame.tsx(3,1): an error'}:{ok:true as const},requestImage:async p=>{bought.push(p.prompt);return {id:'picture-1',status:'ready' as const};},
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))})});
 const summary=await runChatBaseline({input,folder,out,facts:{brand:benchBrandPack(brask),brandName:'Brask'},buy:async()=>undefined as CatalogEntry|undefined,send,tools});
 assert.equal(sent.length,2);assert.equal(sent[0].images,4,'three logos and the supplied photograph, as pictures');assert.equal(sent[0].resume,undefined);
 assert.equal(sent[1].resume,'s1');assert.match(sent[1].text,/^The file does not build:\nFrame\.tsx\(3,1\): an error\nPlease send the complete corrected Frame\.tsx\.$/);
 assert.deepEqual(bought,['Linen.']);assert.deepEqual(written,['export default 1;\n','export default 2;\n']);
 assert.deepEqual({turns:summary.turns,repaired:summary.repaired,pictures:summary.pictures,built:summary.built,usd:summary.apiEquivalentUsd,model:summary.model,effort:summary.effort,output:summary.output},{turns:2,repaired:true,pictures:1,built:true,usd:0.5,model:'claude-opus-5-5',effort:'high',output:5500});
 assert.ok(existsSync(join(out,'chat.png'))&&existsSync(join(out,'chat.json')));
 const saved=await readFile(join(out,'chat-message.txt'),'utf8');assert.ok(saved.includes('[attached pictures: brask-ink.svg, brask-cream.svg, brask-seal.svg, brask-casserole-ember.png]')&&saved.includes('[system line: You are Claude, a helpful assistant.]')&&saved.includes('[model: claude-opus-5-5 · effort: high]'));
 // A second failed build is not repaired again: at most one repair turn.
 builds=-10;const stuck=await runChatBaseline({input,folder,out:join(root,'out2'),facts:{brand:'x'},buy:async()=>undefined,send:async()=>({text:'```tsx Frame.tsx\nexport default 1;\n```',session:'s',seconds:1}),tools:real=>({...tools(real),build:async()=>({ok:false as const,issue:'still broken'})})});
 assert.equal(stuck.turns,2);assert.equal(stuck.built,false);assert.match(stuck.stopped??'',/does not build: still broken/);
});
