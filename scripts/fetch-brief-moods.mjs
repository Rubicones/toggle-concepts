// Downloads the questionnaire's mood pictures once into public/brief-moods (run where the internet is reachable):
//   node scripts/fetch-brief-moods.mjs
// The pictures are shown to the client only; agents never receive them (they would copy them).
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
const files=JSON.parse(readFileSync(new URL("./brief-moods.json",import.meta.url),"utf8"));
let saved=0,kept=0,failed=0;
for(const [path,url] of Object.entries(files)){
 const target=resolve("public/brief-moods",path);
 if(existsSync(target)){kept++;continue;}
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  const type=response.headers.get("content-type")??"";
  if(!response.ok||!type.startsWith("image/"))throw new Error(`${response.status} ${type}`);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,Buffer.from(await response.arrayBuffer()));saved++;
 }catch(error){failed++;console.error(`${path}: ${error instanceof Error?error.message:error}`);}
}
console.log(`Mood pictures: ${saved} downloaded, ${kept} already present, ${failed} failed.`);
