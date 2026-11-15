// What a bench run rebuilt from an export needs on disk, and the picture stand-in: brand files the direction's own
// input names (fonts, logos, references), and pictures put beside their request by hand. No model, no network.
import {copyFile,readFile,readdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {loadImage} from '@napi-rs/canvas';
import {writeResources} from '../../apps/local-runner/director/workspace';
import type {DirectionInput,CatalogEntry,Resource} from '../../packages/director/types';
import type {BenchBrand} from './brands';

export type MissingBrandFile={kind:'font'|'logo'|'reference';url:string;label:string};
const slug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

/** Brand files the direction's input names that are not in the workspace's public folder. */
export function missingBrandFiles(input:DirectionInput,pub:string):MissingBrandFile[]{
 const local=(url:string)=>!/^(https?:|data:|blob:)/.test(url),gone=(url:string)=>local(url)&&!existsSync(join(pub,url));
 return [
  ...input.brand.fonts.filter(f=>gone(f.url)).map(f=>({kind:'font' as const,url:f.url,label:`${f.family} ${f.weight}${f.style&&f.style!=='normal'?` ${f.style}`:''}`})),
  ...input.brand.logos.filter(l=>gone(l.url)).map(l=>({kind:'logo' as const,url:l.url,label:`logo ${l.id}`})),
  ...input.brand.references.filter(r=>gone(r.url)).map(r=>({kind:'reference' as const,url:r.url,label:`reference ${r.id}`})),
 ];
}

/** Fill missing font files from a folder. A stored file is named by its content (`<sha256>.<ext>`), so a file with
 * the same bytes under any name is that file (exact). Otherwise a file named `<family>-<weight>.<ext>`
 * (inter-tight-600.ttf) or one file for the whole family (`inter-tight.ttf`, a variable font) stands in (not exact:
 * the summary says so). Returns what it copied. */
export async function fillBrandFonts(input:DirectionInput,pub:string,dir:string):Promise<{url:string;from:string;exact:boolean}[]>{
 const names=(await readdir(dir).catch(()=>[] as string[])).filter(n=>/\.(woff2?|ttf|otf)$/i.test(n)),copied:{url:string;from:string;exact:boolean}[]=[];
 const hashes=new Map<string,string>();for(const n of names)hashes.set(createHash('sha256').update(await readFile(join(dir,n))).digest('hex'),n);
 const base=(n:string)=>slug(n.replace(/\.[a-z0-9]+$/i,''));
 for(const f of input.brand.fonts){
  if(existsSync(join(pub,f.url)))continue;
  const ext=f.url.slice(f.url.lastIndexOf('.')).toLowerCase(),family=slug(f.family),stored=f.url.slice(0,f.url.lastIndexOf('.'));
  const exact=names.find(n=>n===f.url)??hashes.get(stored);
  // More than one stored file for one family and weight (script subsets) cannot be told apart by name: only the exact file fits.
  const twins=input.brand.fonts.filter(x=>x.family===f.family&&x.weight===f.weight&&(x.style??'normal')===(f.style??'normal')).length>1;
  const found=exact??(twins?undefined:names.find(n=>base(n)===`${family}-${f.weight}`&&n.toLowerCase().endsWith(ext))??names.find(n=>base(n)===family&&n.toLowerCase().endsWith(ext)));
  if(found){await copyFile(join(dir,found),join(pub,f.url));copied.push({url:f.url,from:found,exact:!!exact});}
 }
 return copied;
}

/** The plain message a bench stops with when brand files are missing. */
export function missingBrandFilesMessage(missing:MissingBrandFile[]):string{
 const fonts=missing.filter(m=>m.kind==='font'),others=missing.filter(m=>m.kind!=='font');
 return ['The export does not hold every brand file the direction uses, so the frame would not be the brand\'s.',
  fonts.length?`Fonts missing (${fonts.length}): ${fonts.map(f=>f.label).join(', ')}. Export the run again with the current export tool (it now includes font files), or pass --fonts=<folder> with the files named <family>-<weight>.<ext> (for example inter-tight-600.ttf).`:'',
  others.length?`Other files missing (${others.length}): ${others.map(f=>`${f.label} (${f.url})`).join(', ')}.`:'',
  'To run all the same, add --allow-missing=1; the summary then says which files were missing.'].filter(Boolean).join('\n');
}

/** The size a bench picture is delivered at: the largest side of any ordered format, rounded up to a common size. */
export const deliverLongSide=(input:Pick<DirectionInput,'formats'>)=>{const need=Math.max(1024,...input.formats.flatMap(f=>[f.width,f.height]));return need<=1024?1024:need<=2048?2048:4096;};
/** The picture stand-in of the bench: the request is written to <pictures>/<id>.request.json and the bench waits for
 * <id>.png or <id>.jpg beside it (made by hand); without it the designer is told the picture could not be made. When
 * the request asks for a cutout, <id>.cutout.png beside the picture is the cutout (put it there first, or within the
 * grace time after the picture); without it the designer is told the cutout failed, as the pipeline would. */
export function fileDropPictures(pictures:string,pub:string,folder:string,input:DirectionInput,catalog:CatalogEntry[],waitMs:number,o:{cutoutGraceMs?:number;pollMs?:number;say?:(line:string)=>void;/** simulate the picture provider refusing payment: every request after this many is refused as in the live run of 15 November */refuseAfter?:number}={}){
 const poll=o.pollMs??3000,say=o.say??(line=>console.error(line)),has=(file:string)=>existsSync(join(pictures,file)),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const longSide=deliverLongSide(input);
 let asked=0;
 return async(resource:Resource)=>{
  if(o.refuseAfter!==undefined&&asked++>=o.refuseAfter){say(`[bench] picture ${resource.id} refused (simulated payment refusal)`);throw new Error('CREATIVE_IMAGE_FAILED:PROVIDER_402');}
  await writeFile(join(pictures,`${resource.id}.request.json`),JSON.stringify({id:resource.id,scene:resource.scene,purpose:resource.purpose,prompt:resource.prompt,aspect:resource.aspect,cutout:!!resource.cutout,mustNotContain:resource.mustNotContain,
   // A picture may fill the largest ordered format, so it is delivered at least that large (craft audit of 15 November:
   // 1,024 px pictures were drawn up to 1.22× and looked soft; the reference sheets' pictures were 2,048 px).
   deliver:{longSide,note:`Deliver the picture at least ${longSide} px on its long side (upscale it if the generator makes it smaller); its cutout at the same size.`}},null,1));
  say(`[bench] picture asked: ${join(pictures,`${resource.id}.request.json`)} — put ${resource.id}.png or .jpg beside it within ${Math.round(waitMs/1000)} s${resource.cutout?`; a cutout is asked: put ${resource.id}.cutout.png there BEFORE the picture`:''}`);
  const until=Date.now()+waitMs;let file:string|undefined;
  while(!file&&Date.now()<until){file=['png','jpg'].map(ext=>`${resource.id}.${ext}`).find(has);if(!file)await sleep(poll);}
  if(!file)return undefined;
  const cutName=`${resource.id}.cutout.png`;
  if(resource.cutout){const grace=Date.now()+(o.cutoutGraceMs??30000);while(!has(cutName)&&Date.now()<grace)await sleep(poll);}
  const bytes=await readFile(join(pictures,file)),image=await loadImage(bytes);await writeFile(join(pub,file),bytes);
  if(Math.max(image.width,image.height)<longSide)say(`[bench] ${file} is ${image.width}×${image.height}: smaller than the ${longSide} px asked for; it will be reported as soft wherever it is drawn larger than its pixels.`);
  const cut=resource.cutout&&has(cutName)?await readFile(join(pictures,cutName)):undefined,cutImage=cut?await loadImage(cut):undefined;
  if(cut)await writeFile(join(pub,cutName),cut);
  const entry={id:resource.id,url:file,thumbnail:file,width:image.width,height:image.height,sha256:'',mime:file.endsWith('png')?'image/png':'image/jpeg',revisionId:'bench',
   ...(cutImage?{cutout:{url:cutName,sha256:'',width:cutImage.width,height:cutImage.height,box:[0,0,1,1]}}:resource.cutout?{cutoutFailed:'no cutout file was put beside the picture'}:{})} as CatalogEntry;
  catalog.push(entry);await writeResources(folder,input,catalog);return entry;};
}

/** A bench brand's own files in the draft folder: its fonts, its logo files and the files its client supplied. A
 * supplied file is a real picture (a product photograph): it is taken from <supplied>/<file> and cannot be invented
 * here, so the bench stops before any request when it is not there, and says what the file must show. */
export async function prepareBrandWorkspace(brand:BenchBrand,pub:string,supplied:string):Promise<void>{
 for(const f of brand.fonts)await copyFile(f.source,join(pub,f.file));
 await writeFile(join(pub,'logo.svg'),brand.logoSvg);
 for(const l of brand.logos??[])await writeFile(join(pub,l.file),l.svg);
 const missing=(brand.supplied??[]).filter(f=>!existsSync(join(supplied,f.file)));
 if(missing.length)throw new Error(`BENCH_SUPPLIED_FILE_MISSING\n${missing.map(f=>`Put ${f.file} in ${supplied}. It is the client's own file: ${f.brief}`).join('\n')}`);
 for(const f of brand.supplied??[])await copyFile(join(supplied,f.file),join(pub,f.file));
}
