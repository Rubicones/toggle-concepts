// Credential-free parser subprocess: bounded files; no macros, generated code, browser scripts or external retrieval.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {resolve,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import * as fontkit from "fontkit";
import mammoth from "mammoth";
import {unzipSync} from "fflate";
import type {MaterialExtraction} from "../../packages/contracts/brand-intake";
const env={NODE_ENV:"production" as const,PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,LANG:"C"};
export type ExtractedFile={kind:MaterialExtraction["kind"];text:string;images:{file:string;sha256:string;page:number;width:number;height:number}[];warnings:string[];metadata:Record<string,unknown>};
export async function extractBrandFile(input:string,out:string,name:string):Promise<ExtractedFile>{
 const bytes=readFileSync(input);if(!bytes.length||bytes.length>52428800)throw new Error("FILE_SIZE_LIMIT");
 const ext=extname(name).slice(1).toLowerCase(),result:ExtractedFile={kind:"text",text:"",images:[],warnings:[],metadata:{}};
 const save=(data:Buffer,page:number)=>{const file=resolve(out,`preview-${page}.jpg`);writeFileSync(file,data,{mode:0o600});result.images.push({file,sha256:createHash('sha256').update(data).digest('hex'),page,width:1024,height:1024});};
 const raster=(source:string,page:number)=>{const r=spawnSync('ffmpeg',['-nostdin','-v','error','-max_alloc','134217728','-protocol_whitelist','file,pipe','-i',source,'-frames:v','1','-vf','scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=white','-c:v','mjpeg','-q:v','3','-f','image2pipe','pipe:1'],{env,timeout:15000,maxBuffer:2*1024*1024});if(r.status!==0)throw new Error('IMAGE_DECODE_FAILED');save(r.stdout,page);};
 if(ext==='pdf'){
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('INVALID_PDF');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=pdfjs.getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:false,enableXfa:false,useWasm:false,standardFontDataUrl:resolve("node_modules/pdfjs-dist/standard_fonts")+"/",cMapUrl:resolve("node_modules/pdfjs-dist/cmaps")+"/",cMapPacked:true});
  const pdf=await loading.promise;try{
   result.kind='pdf';result.metadata={pages:pdf.numPages};
   const {createCanvas}=await import('@napi-rs/canvas');
   for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1024/base.width,1024/base.height)}),canvas=createCanvas(1024,1024),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1024,1024);await page.render({canvasContext:context as unknown as CanvasRenderingContext2D,viewport,canvas:canvas as unknown as HTMLCanvasElement}).promise;save(Buffer.from(canvas.toBuffer('image/jpeg')),n);const content=await page.getTextContent();result.text+=`\n[Page ${n}]\n`+content.items.map(item=>'str' in item?item.str:'').join(' ');page.cleanup();}
  }finally{await loading.destroy();}
 }else if(['ttf','otf','woff','woff2'].includes(ext)){
  const font=fontkit.create(bytes);if('fonts' in font)throw new Error('FONT_COLLECTION_UNSUPPORTED');result.kind='font';const os2=font['OS/2'];result.metadata={container:bytes.subarray(0,4).toString('ascii'),averageAdvanceByScript:Object.fromEntries([['latin','abcdefghijklmnopqrstuvwxyz'],['cyrillic','абвгдежзиклмнопрстуфхцчшщ']].filter(([,sample])=>[...sample].every(ch=>font.characterSet.includes(ch.codePointAt(0)!))).map(([script,sample])=>[script,font.layout(sample).positions.reduce((sum,p)=>sum+p.xAdvance,0)/[...sample].length/font.unitsPerEm])),unitsPerEm:font.unitsPerEm,glyphCoverage:font.characterSet,averageAdvance:font.layout('abcdefghijklmnopqrstuvwxyz').positions.reduce((sum,p)=>sum+p.xAdvance,0)/26/font.unitsPerEm,weight:font['OS/2']?.usWeightClass??400,style:/italic/i.test(font.subfamilyName)?'italic':'normal',family:font.familyName,subfamily:font.subfamilyName,postscriptName:font.postscriptName,numGlyphs:font.numGlyphs,characterCount:font.characterSet.length,latinBasic:font.characterSet.filter(n=>n>=32&&n<127).length,cyrillic:font.characterSet.filter(n=>n>=0x400&&n<=0x4ff).length,embeddingFlags:os2?.fsType??null,copyright:font.copyright};result.text=`[Font metadata]\n${JSON.stringify(result.metadata,null,2)}\nEmbedding flags and copyright metadata do not confirm a license. Human rights review is required.`;
 }else if(ext==='docx'){
  let total=0;const archive=unzipSync(new Uint8Array(bytes),{filter:file=>{total+=file.originalSize;if(file.originalSize>134217728||total>268435456)throw new Error('DOCUMENT_EXPANSION_LIMIT');return /^word\/(document\.xml|media\/[^/]+)$/.test(file.name);}});if(!archive['word/document.xml'])throw new Error('INVALID_DOCX');
  const text=await mammoth.extractRawText({buffer:bytes});result.kind='document';result.text=text.value;result.warnings.push(...text.messages.map(m=>m.message).slice(0,10));
  const media=Object.entries(archive).filter(([key])=>key.startsWith('word/media/'));for(let i=0;i<media.length;i++){const file=resolve(out,`embedded-${i}`);writeFileSync(file,media[i][1],{mode:0o600});raster(file,i+1);}if(media.length)result.warnings.push('Embedded document images are numbered by archive order, not page number.');
 }else if(['doc','rtf'].includes(ext)){
  const converted=spawnSync('/usr/bin/textutil',['-convert','txt','-stdout',input],{env,timeout:15000,maxBuffer:64*1024*1024});if(converted.status!==0)throw new Error('DOCUMENT_CONVERTER_UNAVAILABLE');result.kind='document';result.text=converted.stdout.toString('utf8');result.warnings.push('Text extraction only for this legacy document. Embedded imagery and layout were not inspected.');
 }else if(ext==='svg'){
  result.kind='image';const svgText=bytes.toString('utf8'),vb=svgText.match(/viewBox\s*=\s*[\"']([^\"']+)[\"']/i);if(vb){const box=vb[1].trim().split(/[\s,]+/).map(Number);if(box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0)result.metadata.viewBox=box;}const {chromium}=await import('@playwright/test');const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,env:env as Record<string,string>});try{const page=await browser.newPage({viewport:{width:1024,height:1024},javaScriptEnabled:false});await page.route('**/*',r=>r.abort());await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><body style="margin:0;background:white"><img alt="Brand artwork" style="width:1024px;height:1024px;object-fit:contain" src="data:image/svg+xml;base64,${bytes.toString('base64')}">`);await page.locator('img').evaluate(img=>(img as HTMLImageElement).decode());save(await page.screenshot({type:'jpeg',quality:85}),1);}finally{await browser.close();}result.text='[SVG artwork rasterized locally without scripts or external resources]';
 }else if(['png','jpg','jpeg','webp','gif','avif','heic'].includes(ext)){result.kind='image';raster(input,1);result.text='[Decoded image pixels supplied to the vision agent]';if(ext==='gif')result.warnings.push('Only the first GIF frame was inspected.');
 }else if(['txt','md','csv','json'].includes(ext)){result.kind='text';result.text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(result.text.includes('\u0000'))throw new Error('INVALID_TEXT_FILE');}
 else throw new Error('UNSUPPORTED_FORMAT');
 return result;
}
if(process.argv[1]?.endsWith('extract-brand-file.ts')){
 console.log=(...args)=>process.stderr.write(args.join(' ')+'\n');console.warn=console.log;
 const directory=process.argv[3]??mkdtempSync(resolve(tmpdir(),'brand-extract-'));
 extractBrandFile(process.argv[2],directory,process.argv[4]??'source').then(result=>{writeFileSync(resolve(directory,'extraction.json'),JSON.stringify(result),{mode:0o600});process.stdout.write(JSON.stringify({manifest:resolve(directory,'extraction.json')}));}).catch(error=>{process.stdout.write(JSON.stringify({error:error instanceof Error?error.message:'EXTRACTION_FAILED'}));process.exitCode=1;}).finally(()=>{if(!process.argv[3])rmSync(directory,{recursive:true,force:true});});
}
