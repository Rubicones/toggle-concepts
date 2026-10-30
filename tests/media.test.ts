import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allowedOrigin } from "../packages/data/origin";
import { uploadRequestSchema, noteRequestSchema } from "../packages/contracts/data";
import { inspectMedia, sniffMime } from "../packages/media/inspect.local";

test("M02 upload contracts bound bytes, versions, MIME and filenames",()=>{
  const input={schemaVersion:"1.0",campaignId:"20000000-0000-4000-8000-000000000001",requestId:"30000000-0000-4000-8000-000000000001",filename:"reference.wav",mime:"audio/wav",bytes:42};
  assert.equal(uploadRequestSchema.safeParse(input).success,true);
  for(const patch of [{bytes:10485761},{bytes:0},{mime:"image/svg+xml"},{filename:"../reference.wav"},{filename:"a\r\nb.wav"},{schemaVersion:"2.0"},{objectKey:"media/final"},{userId:"forged"}])assert.equal(uploadRequestSchema.safeParse({...input,...patch}).success,false);
});
test("M02 notes require an optimistic version and reject role/tenant injection",()=>{
  const input={campaignId:"20000000-0000-4000-8000-000000000001",expectedVersion:1,note:"For the studio"};
  assert.equal(noteRequestSchema.safeParse(input).success,true);
  for(const patch of [{expectedVersion:0},{expectedVersion:null},{note:" "},{note:"x".repeat(4001)},{role:"owner"}])assert.equal(noteRequestSchema.safeParse({...input,...patch}).success,false);
});
test("local inspection proves actual WAV bytes, audio stream and duration",()=>{
  const bytes=readFileSync("public/fixtures/tone.wav");const result=inspectMedia(bytes,"audio/wav",bytes.length);
  assert.equal(result.mime,"audio/wav");assert.equal(result.metadata.durationSeconds,6);
  assert.equal(result.metadata.streams[0].type,"audio");assert.equal(result.metadata.streams[0].sampleRate,48000);assert.equal(result.sha256.length,64);
});
test("local inspection proves actual H.264 video and bounded dimensions",()=>{
  const bytes=readFileSync("public/fixtures/motion.mp4");const result=inspectMedia(bytes,"video/mp4",bytes.length);
  assert.equal(result.metadata.width,320);assert.equal(result.metadata.height,180);assert.equal(result.metadata.streams[0].codec,"h264");
});
test("MIME spoofing, wrong size, active SVG and incomplete image headers fail closed",()=>{
  const wav=readFileSync("public/fixtures/tone.wav");assert.throws(()=>inspectMedia(wav,"image/png",wav.length),/ASSET_VALIDATION_FAILED/);
  assert.throws(()=>inspectMedia(wav,"audio/wav",wav.length-1),/ASSET_VALIDATION_FAILED/);
  assert.throws(()=>sniffMime(Buffer.from('<svg><script>alert(1)</script></svg>')),/ASSET_VALIDATION_FAILED/);
  const truncated=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);assert.throws(()=>inspectMedia(truncated,"image/png",truncated.length),/ASSET_VALIDATION_FAILED/);
});

test("Origin uses the real Host authority and rejects foreign, malformed or unexpected targets",()=>{
  assert.equal(allowedOrigin("http://127.0.0.1:3100","127.0.0.1:3100","http://localhost:3000"),true);
  assert.equal(allowedOrigin("https://studio.example","studio.example","https://studio.example"),true);
  for(const [origin,host] of [[null,"studio.example"],["https://foreign.example","studio.example"],["https://studio.example","foreign.example"],["https://studio.example/path","studio.example"],["http://127.0.0.1:3999","127.0.0.1:3999"],["null","studio.example"]] as const)assert.equal(allowedOrigin(origin,host,"https://studio.example"),false);
  assert.equal(allowedOrigin("http://localhost:3999","localhost:3999","http://localhost:3000"),false);
});
