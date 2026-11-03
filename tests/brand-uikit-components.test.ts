import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {autoMaterialRole,findingsForRole,fieldsOutsideRole,roleReadingNotes,materialRoles} from '../packages/brand/material-roles';
import {fieldExtractionRequest,brandFieldKeys} from '../packages/brand/field-extraction';
import {findingPresentation} from '../packages/brand/finding-presentation';
import {importBrandbookToA1,pickBrandColors,choicesFor,paletteFromWords,type BrandbookItem} from '../packages/brand/a1-handoff';
import {buildBrandCard} from '../packages/brand/brand-card';
import {emptyBrandDraft} from '../packages/contracts/brand-kit';
import {approvedBrandModule} from '../packages/director/inputs';
import {readFileSync} from 'node:fs';

const book={id:randomUUID(),version_no:3,sha256:'b'.repeat(64),summary:{findings:20}},c1={id:randomUUID(),immutables:'Keep the product name.'};
const bookFile=randomUUID(),kitFile=randomUUID(),shotFile=randomUUID(),logoFile=randomUUID();
const roles:Record<string,'brandbook'|'uikit'|'screenshot'|'logo'>={[bookFile]:'brandbook',[kitFile]:'uikit',[shotFile]:'screenshot',[logoFile]:'logo'};
const roleOf=(id:string)=>roles[id];
const item=(field:string,value:string,materialId=bookFile,decision='unreviewed'):BrandbookItem=>({findingId:randomUUID(),field,value,materialId,locator:'section',decision,evidence:'provided'});
const rule=(d:ReturnType<typeof importBrandbookToA1>,c:string,k:string)=>d.rules.find(r=>r.category===c&&r.key===k);

test('a UI kit file is its own role: components and interface colours only, never copy or the brand palette',()=>{
 assert.ok(materialRoles.includes('uikit'));
 assert.deepEqual(autoMaterialRole({filename:'button-primary.png',mime:'image/png',relative_path:'ui-kit/button-primary.png'}),{role:'uikit',sure:true});
 assert.deepEqual(autoMaterialRole({filename:'Components.png',mime:'image/png'}),{role:'uikit',sure:true});
 assert.deepEqual(autoMaterialRole({filename:'card.png',mime:'image/png'}),{role:'uikit',sure:false},'a single part name asks the AD');
 assert.deepEqual(autoMaterialRole({filename:'ui-11.png',mime:'image/png'}),{role:'screenshot',sure:true},'screenshots stay screenshots');
 const read=[{field:'components',value:'Primary button: lime fill, mono label, 40 px'},{field:'primaryColors',value:'#7B5CFF track'},{field:'copyRules',value:'NEW TAKE'},{field:'brandName',value:'X'}];
 assert.deepEqual(findingsForRole('uikit',read),[{field:'components',value:'Primary button: lime fill, mono label, 40 px'},{field:'semanticColors',value:'#7B5CFF track'}]);
 assert.ok(fieldsOutsideRole('uikit').includes('copyRules')&&fieldsOutsideRole('uikit').includes('primaryColors'));
 assert.ok(!fieldsOutsideRole('screenshot').includes('components'),'screenshots may name components too');
 assert.match(roleReadingNotes.uikit,/not a screenshot to imitate and not a brand rule/);
});

test('the reader asks for components only when the database accepts them',()=>{
 assert.ok(brandFieldKeys.includes('components'));
 const on=fieldExtractionRequest(true,true),off=fieldExtractionRequest(true,false);
 assert.match(on.prompt,/components \(Interface components\)/);assert.match(on.prompt,/its own components finding/);
 assert.doesNotMatch(off.prompt,/components \(Interface components\)|its own components finding/);
 assert.doesNotMatch(JSON.stringify(off.responseSchema),/"components"/);assert.match(JSON.stringify(on.responseSchema),/"components"/);
 assert.match(JSON.stringify(off.responseSchema),/brief\.cta/,'brief fields stay');
});

test('a colour keeps the words of its own line',()=>{
 assert.deepEqual(findingPresentation('- Background: #0D0D0D\n- Accent color – #DFFF00\n- Text #F2F2F2','primaryColors').colors.map(c=>c.label),['Background','Accent color','Text']);
 assert.equal(findingPresentation('#dfff00 lime accent','primaryColors').colors[0].label,'lime accent');
 assert.equal(findingPresentation('{"name":"Canvas","hex":"#000000"}','primaryColors').colors[0].label,'Canvas','structured names win');
});

test('a saturated colour never becomes paper or ink unless named; a single colour is the accent; words fill paper and ink',()=>{
 // This run's kit: paper #dfff00, ink #0d0d0d. The lime is the accent; the dark is paper; the ink comes from the words.
 const run=[item('primaryColors','Accent color – #dfff00'),item('primaryColors','#0d0d0d'),item('primaryColors','Pure black background, off-white text.')];
 const picks=pickBrandColors(choicesFor('color.ink',run));
 assert.equal(picks.accent?.value,'#dfff00');assert.notEqual(picks.paper?.value,'#dfff00');assert.notEqual(picks.ink?.value,'#dfff00');
 const kit=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,run,c1,randomUUID,roleOf);
 assert.equal(rule(kit,'color','accent')?.value,'#dfff00');assert.equal(rule(kit,'color','paper')?.value,'#0d0d0d');
 const one=choicesFor('color.ink',[item('primaryColors','#dfff00 lime')]);assert.deepEqual(pickBrandColors(one),{accent:one[0]},'one colour is only the accent');
 const words=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,[item('primaryColors','Lime #dfff00 is the only colour.'),item('imagery','Everything sits on a pure black background with white text.')],c1,randomUUID,roleOf);
 assert.equal(rule(words,'color','paper')?.value,'#000000');assert.equal(rule(words,'color','paper')?.status,'inferred');assert.match(rule(words,'color','paper')!.reason,/wording/);
 assert.equal(rule(words,'color','ink')?.value,'#FFFFFF');assert.equal(rule(words,'color','accent')?.value,'#dfff00');
 assert.deepEqual(paletteFromWords([item('voice','We speak plainly.')]),{});
});

test('interface colours and components go to their own rules, never into paper, ink or accent',()=>{
 const rows=[item('primaryColors','Accent – #DFFF00'),item('secondaryColors','Background #0A0A0A'),item('secondaryColors','Foreground #EDEDED'),
  item('semanticColors','Track violet #7B5CFF',kitFile),item('semanticColors','Track coral #FF6B5C',shotFile),item('semanticColors','#FFFFFF',kitFile),
  item('components','Version card: title, author, "applied" tag, hairline border #262626',kitFile),item('components','Header bar with meta tag',shotFile)];
 const kit=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,rows,c1,randomUUID,roleOf);
 assert.deepEqual(['paper','ink','accent'].map(k=>rule(kit,'color',k)?.value),['#0A0A0A','#EDEDED','#DFFF00']);
 const ui=rule(kit,'product','interfaceColors')!;assert.match(ui.value,/Track violet · #7B5CFF/);assert.match(ui.value,/#FF6B5C/);assert.match(ui.value,/#FFFFFF/);
 const components=rule(kit,'product','components')!;assert.match(components.value,/Version card/);assert.match(components.value,/Header bar/);assert.equal(components.provenance.kind,'material');
 // Without roles a screenshot's semantic white could have become the ink; a named brand semantic still counts.
 const named=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,[item('primaryColors','#DFFF00 accent'),item('semanticColors','background #111111'),item('semanticColors','foreground #F5F5F5')],c1,randomUUID,roleOf);
 assert.equal(rule(named,'color','paper')?.value,'#111111');assert.equal(rule(named,'color','ink')?.value,'#F5F5F5');
});

test('font rules hold the family name; the brandbook sentence goes to typography rules; logos come only from artwork',()=>{
 const kit=importBrandbookToA1(emptyBrandDraft(['en-GB']),book,[item('displayFonts','Archivo (`display`) for names, headlines and big numbers, set tight.'),item('monoFonts','JetBrains Mono for labels and data'),item('wordmark','The wordmark is lowercase sonicdesk with a lime full stop.'),item('icon','<svg viewBox="0 0 10 10"></svg>',logoFile)],c1,randomUUID,roleOf);
 assert.equal(rule(kit,'typography','headlineFamily')?.value,'Archivo');assert.equal(rule(kit,'typography','monospaceFamily')?.value,'JetBrains Mono');
 assert.match(rule(kit,'typography','rules')!.value,/headlines and big numbers/);
 assert.deepEqual(kit.rules.filter(r=>r.category==='logo'&&r.key!=='usage').map(r=>r.provenance.sourceId),[logoFile],'the brandbook sentence makes no logo rule');
 assert.match(rule(kit,'logo','usage')!.value,/lowercase/,'the sentence stays as logo usage');
});

test('the brand card shows interface components and warns when there is no interface evidence',()=>{
 let n=0;const f=(field:string,value:string,material:string)=>({id:`f${++n}`,field,value,edited_value:null,decision:'unreviewed',version:1,material_id:material,evidence:'provided',locator:'x'});
 const materials=[{id:'book',filename:'brandbook.md',mime:'text/markdown',role:'brandbook' as const,sure:true},{id:'kit',filename:'ui-kit/cards.png',mime:'image/png',role:'uikit' as const,sure:true}];
 const card=buildBrandCard([f('primaryColors','Accent #dfff00','book'),f('secondaryColors','Background #0a0a0a','book'),f('semanticColors','Track violet #7B5CFF','kit'),f('components','Version card with applied tag','kit')],materials);
 assert.deepEqual(card.interfaceFiles,[{id:'kit',file:'ui-kit/cards.png',role:'uikit'}]);assert.equal(card.components[0].value,'Version card with applied tag');
 assert.deepEqual(card.interfaceColours.map(c=>c.value),['#7B5CFF']);assert.ok(!card.palette.some(p=>p.value.toLowerCase()==='#7b5cff'));
 const text=(c:typeof card)=>c.checks.map(x=>`${x.ok?'ok':'!!'} ${x.text}`).join('\n');
 assert.match(text(card),/ok Interface evidence: 1 UI kit/);assert.match(text(card),/ok 1 interface colour/);
 const none=buildBrandCard([f('primaryColors','Accent #dfff00','book')],[materials[0]]);
 assert.match(text(none),/!! No interface evidence \(UI kit or screenshots\)/);assert.match(text(none),/!! No interface colours/);
});

test('UI kit parts and screenshots reach the director as interface evidence, never as image references',()=>{
 const draft=emptyBrandDraft(['en-GB']);
 const m=(id:string,filename:string,mime:string,role?:string,metadata:Record<string,unknown>={})=>({id,filename,mime,sha256:id.padEnd(64,'0'),objectKey:`k/${id}`,metadata,...(role?{role}:{})});
 const brand=approvedBrandModule(draft,[m('aaa','logo.svg','image/svg+xml','logo'),m('bbb','font.woff2','font/woff2','font',{family:'Archivo'}),m('ccc','cards.png','image/png','uikit'),m('ddd','ui-11.png','image/png','screenshot'),m('eee','mood.jpg','image/jpeg','reference')],{},{});
 assert.deepEqual(brand.references.map(r=>r.id),['eee']);
 assert.deepEqual(brand.interface?.map(i=>[i.id,i.role]),[['ccc','uikit'],['ddd','screenshot']]);
 const without=approvedBrandModule(draft,[m('aaa','logo.svg','image/svg+xml','logo'),m('bbb','font.woff2','font/woff2','font',{family:'Archivo'}),m('eee','mood.jpg','image/jpeg')],{},{});
 assert.equal(without.interface,undefined,'kits without interface files keep their earlier shape');
});

test('the migration adds the role and the field the code uses',()=>{
 const sql=readFileSync('supabase/migrations/20261103000100_brand_uikit_components.sql','utf8');
 for(const role of materialRoles)assert.match(sql,new RegExp(`'${role}'`));
 for(const field of brandFieldKeys)assert.match(sql,new RegExp(`'${field}'`),field);
 assert.match(sql,/studio_brand_field_catalog/);
});
