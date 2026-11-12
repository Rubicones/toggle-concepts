// The bench protocol: the tagged answer is read exactly, and the instructions carry no look of their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readBenchAnswer,benchInstructions,benchBrief,benchTurn,heroScene} from '../scripts/bench/protocol';
import {brands,benchInput} from '../scripts/bench/brands';
import {readSkills} from '../packages/agents/skill-files';

test('a tagged answer gives its files, render request, pictures and done flag', ()=>{
 const a=readBenchAnswer('<say>Doors as type.</say>\n<file path="Frame.tsx">\nexport default ()=>null;\n</file>\n<file path="parts.ts">\n```ts\nexport const a=1;\n```\n</file>\n<picture id="picture-1" ratio="3:4" cutout="true">A carton, centred.</picture>\n<render scenes="scene-2" formats="square, vertical"/>');
 assert.deepEqual(a.files,[{path:'Frame.tsx',source:'export default ()=>null;\n'},{path:'parts.ts',source:'export const a=1;\n'}]);
 assert.equal(a.say,'Doors as type.');assert.equal(a.scenes[0],"scene-2");assert.deepEqual(a.formats,['square','vertical']);assert.equal(a.done,false);
 assert.deepEqual(a.pictures,[{id:'picture-1',ratio:'3:4',cutout:true,brief:'A carton, centred.'}]);
 assert.equal(readBenchAnswer('<say>ok</say><done/>').done,true);
 // Tags inside a file body are code, not instructions.
 assert.equal(readBenchAnswer('<file path="Frame.tsx">\nconst x="<done/>";\n</file>').done,false);
});

test('the instructions name no brand, font or colour, and the brief carries every ordered line', ()=>{
 const text=benchInstructions(readSkills().filter(s=>s.defaultRoles.includes('designer')));
 for(const brand of brands){assert.ok(!text.includes(brand.name));for(const f of brand.fonts)assert.ok(!text.includes(f.family));}
 assert.ok(!/#[0-9a-f]{6}\b/i.test(text),'no colour values in instructions');
 for(const brand of brands){
  const input=benchInput(brand),brief=benchBrief(brand,input,'client');
  for(const facts of Object.values(input.variantFacts??{}))for(const line of facts!.required)assert.ok(brief.includes(`"${line}"`),line);
  assert.ok(brief.includes(heroScene(input)));
 }
});

test('a failed build asks only for the fix; a passed one lists the findings', ()=>{
 assert.match(benchTurn({build:'failed: Frame.tsx(3,1): error'},1,6),/^BUILD failed.*\n\nFix the build/);
 const t=benchTurn({build:'passed',views:['square 1080×1080'],findings:[{view:'square',severity:'hard',detail:'Text is clipped'}]},2,6);
 assert.match(t,/\[hard\] square: Text is clipped/);assert.match(t,/Turns left: 4/);
});
