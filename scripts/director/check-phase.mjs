import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const phase=process.argv[2];if(!/^P[0-7]$/.test(phase??''))throw new Error('phase required');
mkdirSync('artifacts/m08/verification',{recursive:true});const results=[];
for(const [name,args]of [['typecheck',['run','typecheck']],['lint',['run','lint']],['test',['test']],['next build',['run','build']]]){
 const started=performance.now(),r=spawnSync('npm',args,{encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000});
 writeFileSync(`artifacts/m08/verification/${phase}-${args.at(-1)}.log`,(r.stdout??'')+(r.stderr??''));const result={check:name,passed:r.status===0,ms:Math.round(performance.now()-started),exit:r.status};results.push(result);console.log(JSON.stringify(result));if(r.status!==0)console.log(((r.stdout??'')+(r.stderr??'')).slice(-8000));
}
writeFileSync(`docs/m08/${phase}-verification.json`,JSON.stringify(results,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
