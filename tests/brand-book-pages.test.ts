// Brand book pages (docs/reviews/2026-11-16-brand-book-pages.md): the intake's page pictures become catalogue entries,
// the character request reads them and records which show the brand in use, and the art director can correct that.
// A small PDF generated here; no real brand material and no model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractBrandFile} from '../apps/local-runner/extract-brand-file';
import {BOOK_PAGES_LABEL,BOOK_PAGES_SHOWN,BRAND_CHARACTER_SCHEMA,BRAND_CHARACTER_SCHEMA_PAGES,OTHER_PICTURES_WITH_BOOK,annotateBookPages,bookPageEntries,brandCharacterInstructions,isBookPage,markBookPages,materialCatalogue,pageInUse,parseBrandCharacter,pictureCandidates,shownPictures,catalogueText,type PackMaterial} from '../packages/brand/brand-pack-contents';

/** A PDF of n blank pages, each with one coloured rectangle. */
function pdf(n:number):Buffer{
 const objects:string[]=[],kids=Array.from({length:n},(_,i)=>`${3+i*2} 0 R`).join(' ');
 objects.push('<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
 for(let i=0;i<n;i++){const stream=`${(i%3)/2} 0.3 0.6 rg 100 100 ${200+i*40} 300 re f`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 let out='%PDF-1.4\n';const at:number[]=[];objects.forEach((o,i)=>{at.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${at.map(a=>`${String(a).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out,'latin1');
}
const sha=(n:number)=>n.toString(16).padStart(64,'0');
const book=(id:string,filename:string,pages:number):PackMaterial=>({id,filename,relative_path:null,mime:'application/pdf',state:'ready',included:true,role:'brandbook',extraction:{kind:'pdf',images:Array.from({length:pages},(_,i)=>({objectKey:`k/${id}/${i+1}`,sha256:sha(i+1+id.length*1000),page:i+1,width:1024,height:1024}))}} as unknown as PackMaterial);
const photo=(id:string):PackMaterial=>({id,filename:`${id}.jpg`,relative_path:null,mime:'image/jpeg',state:'ready',included:true,role:'photo',extraction:{kind:'image',images:[{objectKey:`k/${id}`,sha256:sha(id.length*77+id.charCodeAt(1)),page:1,width:800,height:600}]}} as unknown as PackMaterial);

test('intake: every page of a brand book PDF is rendered to a picture with its page number (the step that already exists)', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'book-'));
 try{
  const file=join(dir,'book.pdf');await writeFile(file,pdf(3));
  const read=await extractBrandFile(file,dir,'Brand Book.pdf');
  assert.equal(read.kind,'pdf');assert.equal(read.metadata.pages,3);assert.deepEqual(read.images.map(i=>[i.page,i.width,i.height]),[[1,1024,1024],[2,1024,1024],[3,1024,1024]]);
  assert.equal(new Set(read.images.map(i=>i.sha256)).size,3,'each page is its own picture');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('pages become catalogue entries: all of a short book, an even sample of a long one, and they lead the pictures the request reads', ()=>{
 const short=bookPageEntries([book('b1','Brand Book 2026.pdf',5),photo('p1')]);
 assert.deepEqual(short.map(e=>e.name),['brand-book-2026-p1','brand-book-2026-p2','brand-book-2026-p3','brand-book-2026-p4','brand-book-2026-p5']);
 assert.deepEqual([short[0].kind,short[0].line,short[0].size],['brand book page','page 1 of 5','picture 1024×1024']);
 const long=bookPageEntries([book('b2','Guide.pdf',80)]);
 assert.equal(long.length,BOOK_PAGES_SHOWN);assert.deepEqual(long.map(e=>e.picture!.page).slice(0,4),[1,6,11,16]);assert.equal(long.at(-1)!.picture!.page,76,'from the first page to near the last');
 assert.deepEqual(bookPageEntries([{...book('b3','One.pdf',1)}]),[],'a one-page file is already its own entry');
 assert.deepEqual(bookPageEntries([{...book('b4','Photo.pdf',4),role:'photo'} as PackMaterial]),[],'only brand books are read page by page');
 const others=Array.from({length:12},(_,i)=>photo(`p${String.fromCharCode(97+i)}`)),catalogue=[...materialCatalogue(null,[...others,book('b1','Brand Book 2026.pdf',5)],[]),...short];
 const shown=shownPictures(catalogue);
 assert.deepEqual(shown.slice(0,5).map(e=>e.name),short.map(e=>e.name));assert.equal(shown.length,5+OTHER_PICTURES_WITH_BOOK);assert.ok(shown.length<=24,'inside the request\'s picture limit');
 assert.equal(shownPictures(materialCatalogue(null,others,[])).length,12,'without a book the request is as before');
});

test('the reading: the request asks for it only with pages; the answer marks pages in use, carries stated finishes, and the art director can correct it', ()=>{
 const withPages=brandCharacterInstructions(null,{devicesInUse:true,bookPages:true});
 assert.ok(withPages.includes(BOOK_PAGES_LABEL)&&!brandCharacterInstructions(null,{devicesInUse:true}).includes('BRAND BOOK PAGES'));
 assert.match(BOOK_PAGES_LABEL,/The pages are evidence of how the brand looks, never a layout to copy\.$/);
 assert.deepEqual(BRAND_CHARACTER_SCHEMA_PAGES.schema.required,['character','signatures','pages','finishes']);assert.deepEqual(BRAND_CHARACTER_SCHEMA.schema.required,['character','signatures']);
 const pages=bookPageEntries([book('b1','Book.pdf',4)]),catalogue=[...materialCatalogue(null,[photo('pa')],[]),...pages];
 const answer=JSON.stringify({character:'A calm brand. '.repeat(30),signatures:[{name:'book-p2',why:'The mark at full size.'},{name:'nope',why:'x'}],
  pages:[{name:'book-p1',use:'rules',shows:'Colour values in a table.'},{name:'book-p2',use:'in use',shows:'A poster with the mark filling the sheet.'},{name:'book-p2',use:'rules',shows:'again'},{name:'other',use:'in use',shows:'x'},{name:'book-p3',use:'maybe',shows:'x'}],
  finishes:[{name:'sky gradient',value:'linear, 180deg, #A8D4EA 0%, #10243F 100%'},{name:'',value:'x'}]});
 const parsed=parseBrandCharacter(answer,catalogue);
 assert.deepEqual(parsed.pages,[{name:'book-p1',use:'rules',shows:'Colour values in a table.'},{name:'book-p2',use:'in use',shows:'A poster with the mark filling the sheet.'}]);
 assert.deepEqual(parsed.signatures.map(s=>s.name),['book-p2']);
 assert.ok(parsed.character.endsWith('FINISHES AND GRADIENTS (values as the brand book states them)\n- sky gradient: linear, 180deg, #A8D4EA 0%, #10243F 100%'));
 const stored=annotateBookPages(catalogue,parsed.pages),kinds=Object.fromEntries(stored.filter(isBookPage).map(e=>[e.name,e.kind]));
 assert.deepEqual(kinds,{'book-p1':'brand book page (rules)','book-p2':'brand book page (in use)','book-p3':'brand book page (not judged)','book-p4':'brand book page (not judged)'});
 assert.equal(stored.find(e=>e.name==='book-p2')!.line,'A poster with the mark filling the sheet.');assert.deepEqual(stored.filter(e=>!isBookPage(e)),catalogue.filter(e=>!isBookPage(e)));
 // Agents read the pages by name in the catalogue and may ask for one; the owner's tick wins over the reading.
 assert.match(catalogueText(stored)!,/- book-p2 · brand book page \(in use\) · A poster with the mark filling the sheet\. · picture 1024×1024/);
 const corrected=markBookPages(stored,[{name:'book-p3',inUse:true},{name:'book-p2',inUse:false},{name:'pa',inUse:true}]);
 assert.deepEqual(corrected.filter(pageInUse).map(e=>e.name),['book-p3']);assert.equal(corrected.find(e=>e.name==='pa')!.kind,'photo','only pages can be marked');
 assert.equal(pictureCandidates(corrected).filter(isBookPage).length,4,'every page can be chosen as a signature picture');
 // An answer without the new fields (a pack written before, or a brand without a book) reads as before.
 assert.deepEqual(parseBrandCharacter(JSON.stringify({character:'A calm brand. '.repeat(30),signatures:[]}),catalogue).pages,[]);
});
