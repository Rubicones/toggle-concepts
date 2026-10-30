import {test} from "node:test";
import assert from "node:assert/strict";
import {validateWorkflowOutput,workflowCommandSchema} from "../packages/contracts/orchestration";
import {lumaManifest} from "../fixtures/campaign";
import {submitText} from "../packages/agents/text-provider";
const output=(role:string,deliverable:Record<string,unknown>,status="draft")=>JSON.stringify({schemaVersion:"1.0",role,status,summary:"Backend validation fixture",deliverable,inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:null,requiredInputs:[],checks:[]}});
test("ordered 32-row manifest must be complete, unchanged, and role-bound",()=>{
 const manifest={entries:lumaManifest.entries};const deliverable={manifest,orderedCount:32};
 assert.equal(validateWorkflowOutput(output("variants",deliverable),"variants",true,manifest).blocked,false);
 assert.throws(()=>validateWorkflowOutput(output("strategy",deliverable),"variants",true,manifest),/OUTPUT_ROLE_MISMATCH/);
 assert.throws(()=>validateWorkflowOutput(output("variants",{...deliverable,orderedCount:31}),"variants",true,manifest),/COVERAGE/);
 assert.throws(()=>validateWorkflowOutput(output("variants",{...deliverable,manifest:{entries:[...manifest.entries].reverse()}}),"variants",true,manifest),/BINDING/);
 assert.throws(()=>validateWorkflowOutput(output("variants",{...deliverable,manifest:{entries:manifest.entries.map((r,i)=>i? r:{...r,offer:"invented"})}}),"variants",true,manifest),/BINDING/);
});
test("three directions, locale coverage, explicit blockers and paid retry consent",()=>{
 assert.throws(()=>validateWorkflowOutput(output("script",{threeDirections:[{},{}]}),"script",true),/THREE_DIRECTIONS/);
 const manifest={entries:lumaManifest.entries},copy=manifest.entries.map(row=>({variantId:row.id,locale:row.locale,copySlot:"headline",text:"Test copy"}));
 assert.equal(validateWorkflowOutput(output("localization",{localizedCopy:copy}),"localization",true,manifest).blocked,false);
 assert.throws(()=>validateWorkflowOutput(output("localization",{localizedCopy:copy.slice(1)}),"localization",true,manifest),/COVERAGE/);
 assert.throws(()=>validateWorkflowOutput(output("localization",{localizedCopy:copy.map((r,i)=>i?r:{...r,locale:"invented"})}),"localization",true,manifest),/BINDING/);
 assert.equal(validateWorkflowOutput(output("script",{},"blocked"),"script",true).blocked,true);
 assert.throws(()=>validateWorkflowOutput("not JSON","script",true));
 assert.equal(workflowCommandSchema.safeParse({action:"retry",roundId:crypto.randomUUID(),jobId:crypto.randomUUID()}).success,false);
});
test("provider fault receipts never invent text, cost, or automatic submissions",async()=>{
 const original=globalThis.fetch;const cfg={instructions:"Test",maxOutputTokens:100,pricing:{inputPrice:0.0000003,outputPrice:0.0000025}};let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({error:{message:"Rate limited"}},{status:429});};
  const limited=await submitText("test-model","fixture",cfg);assert.equal(limited.cost,0);assert.equal(limited.failure,"PROVIDER_429");assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({error:{message:"Charged error fixture"},usage:{cost:0.0001}},{status:429});
  const charged=await submitText("test-model","fixture",cfg);assert.equal(charged.cost,100);assert.equal(charged.failure,"PROVIDER_429_CHARGED");
  globalThis.fetch=async()=>{throw new Error("Simulated transport timeout");};
  const timeout=await submitText("test-model","fixture",cfg);assert.equal(timeout.outcome,"unknown");assert.equal(timeout.cost,null);assert.equal(timeout.text,null);
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:"actual receipt fixture"}}],usage:{cost:-1}});
  const unresolved=await submitText("test-model","fixture",cfg);assert.equal(unresolved.outcome,"unknown");assert.equal(unresolved.cost,null);
 }finally{globalThis.fetch=original;}
});
