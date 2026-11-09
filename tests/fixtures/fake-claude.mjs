#!/usr/bin/env node
// A stand-in for the Claude Code CLI in automated tests: no model is ever called. It reads the stream-json request
// from stdin and answers according to FAKE_CLAUDE_SCENARIO, with the event shapes of `claude -p --output-format
// stream-json --verbose`.
import {readFileSync,writeFileSync} from 'node:fs';
const scenario=process.env.FAKE_CLAUDE_SCENARIO??'ok',args=process.argv.slice(2);
if(args[0]==='--version'){process.stdout.write('9.9.9 (Claude Code)\n');process.exit(0);}
if(args[0]==='auth'){process.stdout.write(JSON.stringify({loggedIn:process.env.FAKE_CLAUDE_LOGGED_IN!=='0',authMethod:process.env.FAKE_CLAUDE_AUTH??'claude.ai',apiProvider:'firstParty'})+'\n');process.exit(0);}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{input+=c;});
process.stdin.on('end',()=>{
 const message=input.trim()?JSON.parse(input.trim().split('\n')[0]):null,content=message?.message?.content??[];
 const texts=content.filter(c=>c.type==='text').map(c=>c.text),images=content.filter(c=>c.type==='image');
 const out=e=>process.stdout.write(JSON.stringify(e)+'\n');
 const system=(()=>{const i=args.indexOf('--system-prompt-file');return i>=0?readFileSync(args[i+1],'utf8'):'';})();
 if(process.env.FAKE_CLAUDE_RECORD)writeFileSync(process.env.FAKE_CLAUDE_RECORD,JSON.stringify({args,system,content,env:Object.keys(process.env).sort(),maxOutput:process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS??null}));
 const leak=scenario==='leak',schema=args.includes('--json-schema');
 const tools=[...(schema||scenario==='unexpected-structured-tool'?['StructuredOutput']:[]),...(leak?['Bash']:[])];
 out({type:'system',subtype:'init',session_id:'s1',model:process.env.FAKE_CLAUDE_MODEL??'claude-sonnet-test',tools,mcp_servers:leak||scenario==='mcp-only'?[{name:'canary',status:'connected'}]:[],apiKeySource:process.env.FAKE_CLAUDE_KEY_SOURCE??'none',claude_code_version:'9.9.9'});
 if(scenario==='hang'){setInterval(()=>{},1000);return;}
 if(scenario==='noresult'){out({type:'assistant',message:{content:[{type:'text',text:'partial'}]}});process.exit(0);}
 const usage={input_tokens:120,output_tokens:30,cache_creation_input_tokens:0,cache_read_input_tokens:0};
 if(scenario==='limit'){out({type:'result',subtype:'success',is_error:true,result:"You've hit your usage limit · resets 5pm",usage,num_turns:1,session_id:'s1'});process.exit(1);}
 if(scenario==='schema'||scenario==='schema-no-payload'){
  out({type:'assistant',message:{content:[{type:'tool_use',name:'StructuredOutput',input:{bad:true}}]}});
  out({type:'user',message:{content:[{type:'tool_result',is_error:true,content:'schema validation failed'}]}});
  out({type:'assistant',message:{content:[{type:'tool_use',name:'StructuredOutput',input:{answer:'ok'}}]}});
  out({type:'result',subtype:'success',is_error:false,result:'A response was prepared.',...(scenario==='schema'?{structured_output:{answer:'ok'}}:{}),usage,num_turns:2,session_id:'s1',stop_reason:'tool_use'});return;
 }
 // Terminal results the transport must map onto the OpenRouter failure codes.
 if(scenario==='maxtokens'||scenario==='refusal'||scenario==='empty'){const text=scenario==='empty'?'':'cut';out({type:'result',subtype:'success',is_error:false,result:text,usage,num_turns:1,session_id:'s1',stop_reason:scenario==='maxtokens'?'max_tokens':scenario==='refusal'?'refusal':'end_turn'});return;}
 // ok and echo: the answer describes what arrived, so tests can check the request reached the model intact.
 const answer=scenario==='echo'?JSON.stringify({texts,images:images.map(i=>({mediaType:i.source.media_type,bytes:i.source.data.length})),system}):(process.env.FAKE_CLAUDE_ANSWER??'OK');
 out({type:'assistant',message:{content:[{type:'text',text:answer}]}});
 out({type:'result',subtype:'success',is_error:false,result:answer,usage,num_turns:1,session_id:'s1',stop_reason:'end_turn',total_cost_usd:0.0012});
});
