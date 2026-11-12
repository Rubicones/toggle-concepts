// Which request a draft still uses: three provider attempts; failures on this computer before the provider was asked
// (nothing sent, nothing charged) do not use them up. Recorded steps only, no live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickStillAttempt} from '../apps/local-runner/creative-stills';

type Step={id:string;status:string;output:string|null;cost_micro_usd:number|null;error_code:string|null};
const failed=(code:string,cost:number|null=0):Step=>({id:code,status:'failed',output:null,cost_micro_usd:cost,error_code:code});
const chain=(steps:(Step|null)[])=>{const seen:number[]=[];return {seen,lookup:async(attempt:number)=>{seen.push(attempt);return {requestId:`r${attempt}`,step:steps[attempt]??null};}};};

test('three missing-ffmpeg failures no longer block the still: a new request is made after the computer is fixed', async()=>{
 const c=chain([failed('MEDIA_TOOLS_UNAVAILABLE'),failed('MEDIA_TOOLS_UNAVAILABLE'),failed('MEDIA_TOOLS_UNAVAILABLE')]);
 const r=await pickStillAttempt(c.lookup);
 assert.equal(r.requestId,'r3');assert.equal(r.step,null,'a fresh request');
});

test('provider refusals still get three attempts in total, then the refusal is shown', async()=>{
 const c=chain([failed('IMAGE_RESPONSE_INVALID',10),failed('IMAGE_RESPONSE_INVALID',10),failed('IMAGE_RESPONSE_INVALID',10)]);
 const r=await pickStillAttempt(c.lookup);
 assert.equal(r.requestId,'r2');assert.equal(r.step?.error_code,'IMAGE_RESPONSE_INVALID');
 const mixed=chain([failed('MEDIA_TOOLS_UNAVAILABLE'),failed('IMAGE_RESPONSE_INVALID'),failed('IMAGE_RESPONSE_INVALID'),failed('IMAGE_RESPONSE_INVALID')]);
 assert.equal((await pickStillAttempt(mixed.lookup)).requestId,'r3','a local failure does not count as a provider attempt');
});

test('a delivered, running or reconciled still is used as it is; local failures are bounded', async()=>{
 assert.equal((await pickStillAttempt(chain([{...failed('x'),status:'succeeded'}]).lookup)).requestId,'r0');
 assert.equal((await pickStillAttempt(chain([failed('MEDIA_TOOLS_UNAVAILABLE'),{...failed('x'),status:'running'}]).lookup)).requestId,'r1');
 assert.equal((await pickStillAttempt(chain([{...failed('RECONCILED_NO_ACTIVATION'),output:'{}'}]).lookup)).requestId,'r0');
 const endless=await pickStillAttempt(async a=>({requestId:`r${a}`,step:failed('MEDIA_TOOLS_UNAVAILABLE')}));
 assert.ok(Number(endless.requestId.slice(1))<=22,'stops after a bounded number of local failures');
 assert.equal((await pickStillAttempt(chain([failed('MEDIA_TOOLS_UNAVAILABLE',5)]).lookup)).requestId,'r1','a charged failure is never treated as local');
});
