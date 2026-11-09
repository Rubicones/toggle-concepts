// The Local run report (plan §9, §13 S5): `npm run local-claude:report -- <runId>`. Three quantities kept apart:
// 1. actual OpenRouter spending (pictures and any OpenRouter text), from settled receipts;
// 2. observed CLI use: requests, tokens, internal schema attempts, active time, subscription waits;
// 3. the hypothetical text cost on the target models: a forecast with an unmeasured error, never a receipt.
import {writeFile} from 'node:fs/promises';
import {adminClient,checked,sharedTenant} from '../../../packages/data/shared-runtime';

type Step={id:string;role:string;model_id:string;status:string;cost_micro_usd:number|null;reserve_micro_usd:number;error_code:string|null;created_at:string;usage:Record<string,unknown>|null;config_snapshot:Record<string,unknown>};
type Local={transport:string;executedModel?:string;internalAttempts:number;durationMs:number;limitReached?:boolean;forecast?:{microUsd:number;targetModel:string};usage?:{input_tokens?:number;output_tokens?:number;cache_read_input_tokens?:number;cache_creation_input_tokens?:number}};

export function localRunReport(runId:string,execution:Record<string,unknown>|null,steps:Step[]){
 const usd=(micro:number)=>`$${(micro/1e6).toFixed(4)}`,local=(s:Step)=>(s.usage?._local as Local|undefined);
 const cli=steps.filter(s=>local(s)),openrouter=steps.filter(s=>!local(s)),settled=(s:Step)=>!['reserved','running','unknown'].includes(s.status)&&s.cost_micro_usd!==null;
 const roles=[...new Set(steps.map(s=>String(s.config_snapshot?.directorRole??s.role)))].sort();
 const byRole=roles.map(role=>{const list=steps.filter(s=>String(s.config_snapshot?.directorRole??s.role)===role),l=list.filter(local);
  return {role,requests:list.length,local:l.length,inputTokens:l.reduce((n,s)=>n+(local(s)!.usage?.input_tokens??0)+(local(s)!.usage?.cache_read_input_tokens??0)+(local(s)!.usage?.cache_creation_input_tokens??0),0),outputTokens:l.reduce((n,s)=>n+(local(s)!.usage?.output_tokens??0),0),
   internalAttempts:l.reduce((n,s)=>n+local(s)!.internalAttempts,0),activeMs:l.reduce((n,s)=>n+local(s)!.durationMs,0),forecastMicroUsd:l.reduce((n,s)=>n+(local(s)!.forecast?.microUsd??0),0),
   openrouterMicroUsd:list.filter(s=>!local(s)&&settled(s)).reduce((n,s)=>n+(s.cost_micro_usd??0),0),unsettled:list.filter(s=>!settled(s)).length};});
 const actual=openrouter.filter(settled).reduce((n,s)=>n+(s.cost_micro_usd??0),0),reserved=steps.filter(s=>!settled(s)).reduce((n,s)=>n+s.reserve_micro_usd,0);
 const forecast=cli.reduce((n,s)=>n+(local(s)!.forecast?.microUsd??0),0),waits=cli.filter(s=>local(s)!.limitReached||s.error_code==='SUBSCRIPTION_LIMIT').length;
 const models=[...new Set(cli.map(s=>`${s.model_id} → ${local(s)!.executedModel??'?'}`))];
 const lines=[`# Local run report · ${runId}`,'',`Mode: ${execution?`${execution.mode} on ${execution.device_label??execution.device_id??'—'} (CLI ${execution.cli_version??'—'}, ${execution.mapping_version??'—'})`:'openrouter (no frozen Local mode)'}`,
  `Models: ${models.join('; ')||'—'}`,'',
  '## 1. Actual OpenRouter spending',`${usd(actual)} settled${reserved?`, ${usd(reserved)} still reserved or unknown`:''}. Pictures and any OpenRouter text only.`,'',
  '## 2. Observed Claude Code use (subscription)',`${cli.length} requests, ${byRole.reduce((n,r)=>n+r.inputTokens,0).toLocaleString('en-US')} input and ${byRole.reduce((n,r)=>n+r.outputTokens,0).toLocaleString('en-US')} output tokens, ${byRole.reduce((n,r)=>n+r.internalAttempts,0)} internal schema attempts, ${Math.round(byRole.reduce((n,r)=>n+r.activeMs,0)/1000)} s active, ${waits} subscription limit stop(s). Subscription percentage: not observable.`,'',
  '## 3. Hypothetical text cost on the target models',`${usd(forecast)}: Sonnet's tokens at the target model's prices. A forecast; its error is not measured. Not an actual cost.`,'',
  '## By role','| Role | Requests | Local | Input tok | Output tok | Internal attempts | Active s | Forecast | OpenRouter actual | Unsettled |','|---|---|---|---|---|---|---|---|---|---|',
  ...byRole.map(r=>`| ${r.role} | ${r.requests} | ${r.local} | ${r.inputTokens.toLocaleString('en-US')} | ${r.outputTokens.toLocaleString('en-US')} | ${r.internalAttempts} | ${Math.round(r.activeMs/1000)} | ${usd(r.forecastMicroUsd)} | ${usd(r.openrouterMicroUsd)} | ${r.unsettled} |`)];
 return {text:lines.join('\n')+'\n',actualMicroUsd:actual,forecastMicroUsd:forecast,cliRequests:cli.length,byRole};
}

async function main(){
 const runId=process.argv[2];if(!runId||!/^[0-9a-f-]{36}$/.test(runId)){console.error('Usage: npm run local-claude:report -- <runId>');process.exit(1);}
 const admin=adminClient();
 const execution=(await admin.from('studio_text_executions').select('*').eq('scope_kind','run').eq('scope_id',runId).maybeSingle()).data as Record<string,unknown>|null;
 const steps:Step[]=[];for(let from=0;;from+=500){const page=checked(await admin.from('studio_agent_steps').select('id,role,model_id,status,cost_micro_usd,reserve_micro_usd,error_code,created_at,usage,config_snapshot').eq('tenant_id',sharedTenant).eq('run_id',runId).order('created_at').range(from,from+499))as Step[];steps.push(...page);if(page.length<500)break;}
 const report=localRunReport(runId,execution,steps),path=`artifacts/local-claude-report-${runId}.md`;
 await writeFile(path,report.text);console.log(report.text);console.log(`Saved ${path}`);
}
if(process.argv[1]?.endsWith('report.ts'))void main();
