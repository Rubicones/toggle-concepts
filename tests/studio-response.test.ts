import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStudioResponse} from '../packages/contracts/studio-response';

test('reads a valid JSON payload and preserves a useful API error',async()=>{
 assert.deepEqual(await readStudioResponse(Response.json({schemaReady:true})),{schemaReady:true});
 await assert.rejects(readStudioResponse(Response.json({message:'Enable Brandbook updates in Settings.'},{status:503})),/Enable Brandbook updates in Settings\./);
});
test('HTML, empty and truncated responses produce a readable error without leaking response contents',async()=>{
 for(const body of ['<!doctype html><html>Private server traceback</html>','Internal Server Error','','{"schemaReady":']){
  await assert.rejects(readStudioResponse(new Response(body,{status:500})),error=>{
   assert.ok(error instanceof Error);assert.match(error.message,/unreadable response \(HTTP 500\)/);assert.doesNotMatch(error.message,/JSON.parse|Private server traceback|Unexpected token/);return true;
  });
 }
});
test('an HTML success response cannot be mistaken for campaign data',async()=>{
 await assert.rejects(readStudioResponse(new Response('<html>Sign in</html>',{status:200,headers:{'Content-Type':'text/html'}})),/unreadable response \(HTTP 200\)/);
});
test('missing or malformed error messages use the status fallback',async()=>{
 for(const payload of [null,{message:3},{message:''},{error:'private'}])await assert.rejects(readStudioResponse(Response.json(payload,{status:503})),/could not complete this request \(HTTP 503\)/);
});
test('an interrupted response reports a connection failure without a parser exception',async()=>{
 const stream=new ReadableStream({start(controller){controller.error(new Error('private socket detail'));}});
 await assert.rejects(readStudioResponse(new Response(stream,{status:200})),/connection ended before the studio response finished \(HTTP 200\)/);
});
