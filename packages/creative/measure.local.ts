import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {draftFonts} from "./compiler";
import type {DraftTextTask,DraftFit} from "../contracts/drafts";
// Self-contained trusted function runs only in the isolated font-measurement browser.
export function fitDraftText(tasks:DraftTextTask[]):DraftFit[]{
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d")!;
 return tasks.map(task=>{
  for(let size=task.maxFont;size>=task.minFont;size--){
   ctx.font=`400 ${size}px StudioNoto`;const lines:string[]=[];
   for(const paragraph of task.text.split("\n")){
    let line="";
    for(const token of paragraph.split(/(\s+)/).filter(Boolean)){
     const next=line+token;if(ctx.measureText(next.trimEnd()).width<=task.width-2){line=next;continue;}
     if(line.trim()){lines.push(line.trimEnd());line="";}
     if(ctx.measureText(token.trim()).width>task.width-2){for(const char of token){if(ctx.measureText(line+char).width>task.width-2){lines.push(line);line="";}line+=char;}}else line=token.trimStart();
    }
    lines.push(line.trimEnd());
   }
   const widths=lines.map(line=>ctx.measureText(line).width);
   if(lines.length<=task.maxLines&&lines.length*size*1.2<=task.height-2&&widths.every(w=>w<=task.width-2))return {key:task.key,fontSize:size,lines,widths,fits:true};
  }
  return {key:task.key,fontSize:task.minFont,lines:[task.text],widths:[],fits:false};
 });
}
export async function measureDraftText(tasks:DraftTextTask[]){
 const executablePath=process.env.CHROME_PATH??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
 const browser=await chromium.launch({executablePath,headless:true,env:{PATH:process.env.PATH??"",TMPDIR:process.env.TMPDIR??"",LANG:"en_US.UTF-8"}});
 try{
  const page=await browser.newPage();await page.route("**/*",route=>route.abort());
  const fonts=await Promise.all(draftFonts.map(async asset=>{const bytes=await readFile(resolve("public",asset.objectKey));if(createHash("sha256").update(bytes).digest("hex")!==asset.sha256)throw new Error("FONT_HASH_MISMATCH");return {url:`data:font/woff2;base64,${bytes.toString("base64")}`,cyrillic:asset.revisionId.includes("cyrillic")};}));
  await page.evaluate(async(fonts)=>{for(const font of fonts){const face=await new FontFace("StudioNoto",`url(${font.url})`,{weight:"400",unicodeRange:font.cyrillic?"U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116":"U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC"}).load();document.fonts.add(face);}await document.fonts.ready;},fonts);
  return {fits:await page.evaluate(fitDraftText,tasks),engine:`Chromium ${browser.version()} · Canvas2D · packaged Noto Sans 400`};
 }finally{await browser.close();}
}
