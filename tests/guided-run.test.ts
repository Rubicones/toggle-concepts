import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {importBrandbookToA1,brandbookRuleChoices,type BrandbookItem} from '../packages/brand/a1-handoff';
import {brandAcceptanceBlockers,emptyBrandDraft} from '../packages/contracts/brand-kit';
import {guidedRunCommand,guidedMilestoneStates,runAttention,type GuidedRunView} from '../packages/contracts/guided-run';
const book={id:randomUUID(),version_no:2,sha256:'a'.repeat(64),summary:{findings:305}},material=randomUUID(),c1={id:randomUUID(),immutables:'Keep the actual product UI intact.'};
const item=(field:string,value:string):BrandbookItem=>({findingId:randomUUID(),field,value,materialId:material,locator:'Source section',decision:'unreviewed',evidence:'provided'});
test('305 source findings produce a curated A1 working kit without approving or replacing the immutable book',()=>{
 const items=Array.from({length:305},(_,i)=>item(i%2?'voice':'primaryColors',i%2?'A calm, precise voice.':JSON.stringify({name:'Accent '+i,hex:'#DFFF00'}))),before=structuredClone(items);
 const result=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,items,c1,randomUUID);
 assert.deepEqual(items,before);assert.equal(result.brandbookImports?.[0].findingCount,305);assert.ok(result.rules.length<=40);assert.equal(result.rules.every(r=>r.decision==='unreviewed'&&!r.sourceVerified),true);assert.equal(result.fontRightsConfirmed,false);assert.equal(result.localeChecks[0].verified,false);assert.equal(result.sourceMaterialIds?.[0],material);assert.ok(result.rules.every(r=>r.value.length<=2000));assert.ok(brandAcceptanceBlockers(result,['en-GB'],c1.id,[],[{id:material,filename:'book',mime:'text/plain',bytes:10,sha256:'a'.repeat(64)}]).length>0);
});
test('same book is idempotent and authored instructions, rules, rejected decisions and rights are preserved',()=>{
 const draft=emptyBrandDraft(['en-GB']);draft.instructions='Human direction';draft.boundaries='Human boundaries';draft.fontRights='Human font rights';const original=item('voice','Extracted voice');
 draft.rules=[{id:randomUUID(),category:'voice',key:'tone',value:'Human voice',status:'proposed',decision:'accepted',sourceVerified:true,provenance:{kind:'ad_instruction',sourceId:null,locator:'AD'},reason:'Explicit direction'}];
 const result=importBrandbookToA1(draft,book,[original],c1,randomUUID);assert.equal(result.instructions,'Human direction');assert.equal(result.fontRights,'Human font rights');assert.deepEqual(result.rules.find(r=>r.category==='voice'),draft.rules[0]);assert.deepEqual(importBrandbookToA1(result,book,[original],c1,()=>{throw new Error('Unexpected second import');}),result);
});
test('ambiguous palettes resolve to the most readable kept color; all cited candidates remain available',()=>{
 const rows=[item('primaryColors','{"name":"Text","hex":"#FFFFFF"}'),item('primaryColors','{"name":"Foreground","hex":"#EEEEEE"}'),item('primaryColors','{"name":"Canvas","hex":"#070707"}')];
 const result=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,rows,c1,randomUUID),ink=result.rules.find(r=>r.category==='color'&&r.key==='ink')!,paper=result.rules.find(r=>r.category==='color'&&r.key==='paper')!;
 assert.equal(ink.value,'#FFFFFF');assert.equal(paper.value,'#070707');const choices=brandbookRuleChoices(result,new Map([[book.id,rows]]));assert.equal(choices[ink.id].length,3);assert.equal(ink.brandbookSource?.findingIds.length,1);
});
test('original font names, material citations and C1 product invariants survive the handoff',()=>{
 const result=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,[item('displayFonts','Archivo'),item('bodyFonts','JetBrains Mono'),item('fontLicenses','Supplied OFL license — verify its scope.')],c1,randomUUID);
 assert.equal(result.rules.find(r=>r.key==='headlineFamily')?.value,'Archivo');assert.equal(result.rules.find(r=>r.key==='bodyFamily')?.value,'JetBrains Mono');assert.equal(result.rules.find(r=>r.key==='immutables')?.provenance.sourceId,c1.id);assert.equal(result.rules.some(r=>r.key==='draftFallback'),false);assert.match(result.fontRights,/OFL/);
});
test('run controls require explicit approvals and stable change IDs',()=>{
 assert.equal(guidedRunCommand.safeParse({action:'approveBrand',reviewerName:'AD',notes:'Reviewed',allowDraftFontFallback:false,confirm:false}).success,false);
 assert.equal(guidedRunCommand.safeParse({action:'change',role:'script',note:'Better opening',expectedVersion:1,requestId:randomUUID()}).success,true);
 assert.equal(guidedRunCommand.safeParse({action:'change',role:'script',note:'Better opening',expectedVersion:1}).success,false);
});
test('timeline is based on actual successful jobs, never a timer or invented completion',()=>{
 const view={control:null,jobs:[]} as unknown as GuidedRunView;assert.equal(guidedMilestoneStates(view).script,'waiting');
 view.control={stage:'planning',status:'running'} as GuidedRunView['control'];view.jobs=[{job_key:'script',state:'failed'},{job_key:'variants',state:'succeeded'}] as GuidedRunView['jobs'];assert.equal(guidedMilestoneStates(view).script,'active');
 view.jobs[0].state='succeeded';assert.equal(guidedMilestoneStates(view).script,'done');view.control!.status='blocked';assert.ok(Object.values(guidedMilestoneStates(view)).includes('blocked'));
 assert.match(runAttention('FINAL_PRODUCTION_UNAVAILABLE')!.detail,/cannot automate/);assert.match(runAttention('UNRESOLVED_PROVIDER_RECEIPT')!.detail,/twice/);
});

test('the exact submitted-brief revision maps to its enclosing C1; foreign UUIDs still fail',async()=>{
 const {importBrandProposal,brandInputErrors}=await import('../packages/contracts/brand-kit');
 const {diagnoseBrandProposal}=await import('../packages/brand/proposal-diagnostic');
 const checkpoint=randomUUID(),brief=randomUUID(),step=randomUUID(),draft=emptyBrandDraft(['en-GB']);
 const output=(sourceId:string)=>JSON.stringify({role:'brand-kit',summary:'A complete saved result.',deliverable:{brandKitProposal:{rules:[{category:'color',key:'ink',value:'#070707',status:'provided',provenance:{kind:'c1',sourceId,locator:'questionnaire.immutables'},reason:'The submitted brief specifies this color.'},{category:'color',key:'paper',value:'#FFFFFF',status:'provided',provenance:{kind:'c1',sourceId,locator:'questionnaire.immutables'},reason:'The submitted brief specifies this background.'}],conflicts:[]}}});
 const imported=importBrandProposal(output(brief),draft,step,randomUUID,{checkpointId:checkpoint,briefRevisionId:brief});assert.equal(imported.rules[0].provenance.sourceId,checkpoint);assert.match(imported.rules[0].provenance.locator,new RegExp(brief));assert.equal(imported.rules.every(r=>!r.sourceVerified&&r.decision==='unreviewed'),true);assert.deepEqual(brandInputErrors(imported,checkpoint,[]),[]);
 const args={stepId:step,model:'google/gemini-2.5-flash',costMicroUsd:14606,status:'succeeded',errorCode:null,draft,draftVersion:4,preparedVersion:4,checkpointId:checkpoint,briefRevisionId:brief,assets:[],materials:[]};
 const valid=diagnoseBrandProposal({...args,output:output(brief)});assert.equal(valid.canImport,true);assert.equal(valid.rules.length,2);assert.deepEqual(valid.issues,[]);assert.equal(valid.costMicroUsd,14606);
 const foreign=diagnoseBrandProposal({...args,output:output(randomUUID())});assert.equal(foreign.canImport,false);assert.ok(foreign.issues.some(i=>i.includes('color.ink')&&i.includes('foreign source')));
 const edited=diagnoseBrandProposal({...args,draftVersion:5,output:output(brief)});assert.equal(edited.canImport,false);assert.match(edited.issues.join(),/newer version/);
 const recovered=diagnoseBrandProposal({...args,draft:imported,draftVersion:5,output:output(brief)});assert.equal(recovered.imported,true);assert.equal(recovered.canImport,false);
 const view={control:{stage:'brand',status:'blocked'},brandResult:recovered,jobs:[]} as unknown as GuidedRunView;assert.equal(guidedMilestoneStates(view).brand,'review');
});
test('saved response diagnostics expose provider errors and incomplete output without asking for a new paid request',async()=>{
 const {diagnoseBrandProposal}=await import('../packages/brand/proposal-diagnostic');
 const args={stepId:randomUUID(),model:'google/gemini-2.5-flash',costMicroUsd:10000,status:'failed',errorCode:'OUTPUT_TOKEN_LIMIT',draft:emptyBrandDraft(['en-GB']),draftVersion:1,preparedVersion:1,checkpointId:randomUUID(),briefRevisionId:randomUUID(),assets:[],materials:[]};
 const result=diagnoseBrandProposal({...args,output:'{"incomplete":',usage:{_studio:{maxOutputTokens:3600,finishReason:'length'}}});assert.equal(result.canImport,false);assert.match(result.providerMessage!,/3600/);assert.match(result.issues.join(),/not complete JSON/);assert.equal(result.output,'{"incomplete":');
 assert.equal(guidedRunCommand.safeParse({action:'recoverBrandResult',stepId:args.stepId,expectedVersion:1}).success,true);
});
test('kept colors, logo files, product media and font weights flow into the working kit',()=>{
 const keep=(field:string,value:string)=>({...item(field,value),decision:'keep'});
 const rows=[keep('primaryColors','{"name":"sd-accent","hex":"#dfff00"}'),keep('secondaryColors','{"name":"sd-bg","hex":"#070707"}'),keep('secondaryColors','{"name":"sd-fg","hex":"#e8e8e8"}'),item('secondaryColors','{"name":"sd-line","hex":"#242424"}'),keep('icon','<svg viewBox="0 0 10 10"></svg>'),keep('displayFonts','Archivo SemiBold'),keep('displayFonts','Archivo')];
 const media=randomUUID(),result=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,rows,{...c1,sourceAssetIds:[media]},randomUUID),value=(c:string,k:string)=>result.rules.find(r=>r.category===c&&r.key===k)?.value;
 assert.equal(value('color','paper'),'#070707');assert.equal(value('color','ink'),'#e8e8e8');assert.equal(value('color','accent'),'#dfff00');assert.equal(value('typography','headlineFamily'),'Archivo');
 assert.ok(result.rules.some(r=>r.category==='logo'&&r.key==='icon'&&r.provenance.kind==='material'));assert.deepEqual(result.sourceAssetIds,[media]);
});
test('one-click review fills missing required rules with recorded defaults',async()=>{
 const {applyRunBrandReview,brandAcceptanceBlockers}=await import('../packages/contracts/brand-kit');
 const draft=applyRunBrandReview(emptyBrandDraft(['en-GB']),{reviewerName:'AD',note:'ok',fallbackRuleId:null});
 assert.deepEqual(brandAcceptanceBlockers(draft,['en-GB'],c1.id,[],[]),[]);assert.ok(draft.rules.every(r=>r.decision==='accepted'&&r.value));
});
