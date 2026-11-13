// D6: a blind pair from two bench runs of the same brand, one with all skills and one with --without-skill=<id>.
// The two sweeps are copied as A and B in an order fixed by the pair (LC7 blindOrder, packages/agents/ab-report.ts), so the
// owner judges them without knowing which is which; the key and the token difference are written apart, to open after.
//   node --import tsx scripts/bench/ablation-pair.ts <run folder 1> <run folder 2>
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {blindOrder} from '../../packages/agents/ab-report';

type Summary={brand:string;withoutSkill?:string;input:number;cached:number;output:number;usd:number;seconds:number};
async function main(){
 const [x,y]=process.argv.slice(2).map(p=>resolve(p));if(!x||!y)throw new Error('Two bench run folders, please.');
 const read=async(d:string)=>JSON.parse(await readFile(join(d,'summary.json'),'utf8')) as Summary,[sx,sy]=await Promise.all([read(x),read(y)]);
 if(sx.brand!==sy.brand)throw new Error('Both runs must be the same brand.');if(!!sx.withoutSkill===!!sy.withoutSkill)throw new Error('One run with all skills and one with --without-skill.');
 const [a]=blindOrder(basename(x),basename(y)),[A,B]=a===basename(x)?[x,y]:[y,x];
 const out=resolve('artifacts/bench',`pair-${sx.brand}-${(sx.withoutSkill??sy.withoutSkill)!}`);await mkdir(out,{recursive:true});
 await cp(join(A,'sweep'),join(out,'A'),{recursive:true});await cp(join(B,'sweep'),join(out,'B'),{recursive:true});
 const s=(d:string)=>d===x?sx:sy,tokens=(v:Summary)=>v.input+v.cached+v.output,without=s(A).withoutSkill?'A':'B';
 await writeFile(join(out,'.key.json'),JSON.stringify({withoutSkill:sx.withoutSkill??sy.withoutSkill,without,tokens:{A:tokens(s(A)),B:tokens(s(B))},difference:tokens(s(without==='A'?A:B))-tokens(s(without==='A'?B:A)),usd:{A:s(A).usd,B:s(B).usd}},null,1));
 console.log(`Blind pair ready in ${out}: look at A/ and B/ and say which is better (or that you cannot tell). Then open .key.json for which run left out the skill and the token difference, and record your verdict on the skill's card in Models & agents.`);
}
void main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
