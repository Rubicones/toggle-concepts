import {test} from "node:test";
import assert from "node:assert/strict";
import {compilerFixture} from "../fixtures/drafts";
import {prepareDrafts,finishDrafts,draftHash} from "../packages/creative/compiler";
import {measureDraftText} from "../packages/creative/measure.local";
import {validateSubstitution} from "../packages/contracts/scene";
test("three recipes cover the 32-row order without changing final scope or stable slots",()=>{
 const {plan,context}=compilerFixture(),first=prepareDrafts(plan,context),second=prepareDrafts(plan,context);assert.deepEqual(first,second);assert.equal(first.compilation.qa.issues.length,0);assert.equal(first.compilation.programs.length,96);assert.equal(context.scope.requestedFinalVideoCount,32);
 const same=first.compilation.programs.filter(p=>p.directionId===plan.directions[0].id);const slots=same.map(p=>p.scenes.find(s=>s.semanticRole==="hook")!.slots.map(s=>s.id));assert.ok(slots.every(ids=>JSON.stringify(ids)===JSON.stringify(slots[0])));
});
test("missing copy/media, foreign/duplicate rows, mixed variation groups and glyph failures block compilation",()=>{
 const {plan,context}=compilerFixture();const invalid=structuredClone(plan);invalid.directions[0].bindings[0].heroAssetId=null;invalid.directions[0].bindings[0].hook="";invalid.directions[0].bindings[0].variantIds.push("foreign-row");invalid.directions[0].bindings[1].variantIds.push(invalid.directions[0].bindings[0].variantIds[0]);invalid.directions[1].bindings[0].hook="مرحبا";
 const codes=prepareDrafts(invalid,context).compilation.qa.issues.map(i=>i.code);for(const code of ["MISSING_COPY","MISSING_IMAGE","FOREIGN_VARIANT","DUPLICATE_BINDING","GLYPH_CAPABILITY","VARIATION_OVERRIDE"])assert.ok(codes.includes(code),code);
});
test("video/3D bindings remain still proxies with final substitution requirements",()=>{
 const {plan,context}=compilerFixture();plan.directions[0].bindings[0].beatWeights=[3,8,4];plan.directions[0].bindings[0].resource={kind:"video",compositionIntent:"Entire product visible",motionIntent:"Slow camera movement",protectedArea:{x:0,y:0,w:1,h:1}};plan.directions[1].bindings[0].resource={kind:"model3d",compositionIntent:"Preserve the entire product",cameraRecipeId:"front",boundsMeters:{x:1,y:1,z:1},protectedArea:{x:0,y:0,w:1,h:1}};
 const prepared=prepareDrafts(plan,context);assert.equal(prepared.compilation.qa.issues.length,0);const scene=prepared.compilation.programs[0].scenes[0],layer=scene.layers[0];assert.equal(layer.kind,"video");assert.deepEqual(prepared.compilation.programs[0].scenes.map(s=>s.durationFrames),[90,240,120]);const finalContract=prepared.compilation.programs[0].scenes[2].resourceContracts[0];assert.equal(finalContract.requirement.kind==="video"?finalContract.requirement.trimStartSeconds:undefined,11);assert.equal("finalAssetRevisionId" in layer?layer.finalAssetRevisionId:undefined,null);assert.throws(()=>validateSubstitution(scene.resourceContracts[0],scene.assets[0]),/kind mismatch/);
});
test("actual isolated Chromium measures Cyrillic and all 96 bindings; oversized legal copy cannot be hidden",async()=>{
 const {plan,context}=compilerFixture(),prepared=prepareDrafts(plan,context),measurement=await measureDraftText(prepared.tasks);const compiled=finishDrafts(prepared.compilation,measurement.fits,measurement.engine);assert.equal(compiled.qa.passed,true,JSON.stringify(compiled.qa.issues.slice(0,3)));assert.equal(compiled.qa.fontMeasured,true);assert.ok(measurement.fits.some(f=>f.lines.length>1));assert.equal(draftHash(compiled),draftHash(finishDrafts(prepared.compilation,measurement.fits,measurement.engine)));
 const giant={key:"giant-legal",text:"Обязательные условия ".repeat(50),width:500,height:30,minFont:18,maxFont:22,maxLines:2};const overflow=await measureDraftText([giant]);assert.equal(overflow.fits[0].fits,false);
});
