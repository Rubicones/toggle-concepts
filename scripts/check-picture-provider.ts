// A one-click check of the picture provider on the studio computer (C:\toggle\Check-Pictures.cmd). It reads the key
// from the studio's .env.local, never prints it (only its last four characters), says what the provider reports about
// the key and the account, what one picture reserves, and on "y" buys one test picture exactly as the studio does.
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {loadImage} from '@napi-rs/canvas';
import {IMAGE_MODEL} from '../packages/agents/defaults';
import {quoteImage,type ImageQuote} from '../packages/agents/image-provider';
import {accountLines,buyTestPicture,conclusion,keyFromEnvFile,priceLines,providerMaximumUsd,readCredits,readKey,testPictureRequest,type TestResult} from '../packages/data/picture-provider-check';

const say=(line='')=>console.log(line);
async function main(){
 const key=keyFromEnvFile(await readFile('.env.local','utf8').catch(()=>''))??process.env.OPENROUTER_API_KEY;
 if(!key){say('No OPENROUTER_API_KEY line was found in the studio\'s settings (.env.local). Add it to C:\\toggle\\.env.local and run the installer.');return;}
 say('Asking the picture provider about this key...');
 const [k,c]=await Promise.all([readKey(key),readCredits(key)]);for(const line of accountLines(key,k,c))say(line);
 say();let quote:ImageQuote|undefined,maximumUsd:number|null=null;
 try{
  const catalog=await (await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000)})).json() as {data:{id:string;pricing:{prompt:string;completion:string};top_provider?:{max_completion_tokens?:number|null}|null}[]},model=catalog.data.find(m=>m.id===IMAGE_MODEL);
  if(!model?.top_provider?.max_completion_tokens)throw new Error('the model is not in the provider\'s list');
  // The same pricing call the studio makes for a still with no reference pictures.
  const priced=await quoteImage(IMAGE_MODEL,'1:1',Number(model.pricing.prompt),4096,Number(model.pricing.completion),model.top_provider.max_completion_tokens);
  quote=priced;maximumUsd=providerMaximumUsd(Number(model.pricing.completion),priced.outputPrice,model.top_provider.max_completion_tokens);
  for(const line of priceLines(priced,maximumUsd))say(line);
 }catch(error){say(`The picture model's price could not be read: ${error instanceof Error?error.message:'unknown error'}.`);}
 let test:TestResult|undefined;
 if(quote){
  say();const rl=createInterface({input:process.stdin,output:process.stdout}),answer=(await rl.question('Buy one test picture now (about $0.04)? y/n ')).trim().toLowerCase();rl.close();
  if(answer==='y'){
   say(`Sending the studio's own request (${JSON.stringify(testPictureRequest(quote)).length} characters, one picture, ${quote.aspectRatio})...`);
   test=await buyTestPicture(key,quote,fetch,async bytes=>(await loadImage(bytes)).width);
   say(test.ok?`Bought: a picture ${test.width??'?'} px wide${test.costUsd!==null?`, charged $${test.costUsd.toFixed(4)}`:''}.`:`Refused (HTTP ${test.status}). The provider's full answer:\n${test.said}`);
  }
 }
 say();say(conclusion({key:k,credits:c,maximumUsd,priced:!!quote,...(test?{test}:{})}));
}
main().catch(error=>{say(`The check stopped: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
