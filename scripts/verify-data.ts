import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoData as d } from "../fixtures/data-demo";
import { dataConfig } from "../packages/data/config.server";
import { objectStore } from "../packages/media/s3.server";
import { cleanupUploads, digestBytes, validateNextUpload } from "../packages/media/validate-upload.local";
import { loadLocalEnv, requireLoopback } from "./local-env";

async function main() {
  loadLocalEnv(); const config=dataConfig(); requireLoopback(config.url); requireLoopback(process.env.LOCAL_DATABASE_URL ?? ""); requireLoopback(process.env.S3_ENDPOINT ?? "");
  const credentials=JSON.parse(readFileSync("artifacts/m02/demo-credentials.json","utf8"));
  const pool=new pg.Pool({connectionString:process.env.LOCAL_DATABASE_URL,max:3}); const results:string[]=[];
  const clients:SupabaseClient[]=[];
  const login=async(role:string)=>{const c=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await c.auth.signInWithPassword(credentials[role]);assert.equal(signed.error,null,`Auth login ${role}`);clients.push(c);return c;};
  const as=async(role:string,sql:string,values:unknown[]=[])=>{const c=await pool.connect();try{await c.query("begin");await c.query("set local role authenticated");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials[role].id]);return await c.query(sql,values);}finally{await c.query("rollback");c.release();}};
  const rejected=async(role:string,sql:string,values:unknown[]=[],code="42501")=>assert.rejects(()=>as(role,sql,values),(e:unknown)=>(e as {code?:string}).code===code);
  try {
    const producer=await login("producer"), client=await login("client"), worker=await login("worker");
    assert.ok((await producer.auth.getUser()).data.user);
    const settings=await (await fetch(`${config.url}/auth/v1/settings`,{headers:{apikey:config.key}})).json();assert.equal(settings.external?.email,true);assert.equal(settings.disable_signup,true);
    results.push("Real Supabase password Auth and server-validated identity; public signup disabled");
    const producerCampaigns=await as("producer","select * from public.campaigns");assert.ok(producerCampaigns.rows.some((c)=>c.id===d.campaign));assert.ok(producerCampaigns.rows.every((c)=>c.tenant_id===d.tenant));
    assert.equal((await as("director","select * from public.campaigns")).rowCount,1);
    assert.equal((await as("other","select * from public.campaigns")).rowCount,1);
    assert.equal((await as("stranger","select * from public.client_campaigns()")).rowCount,0);
    const clientCampaigns=await as("client","select * from public.client_campaigns()");assert.equal(clientCampaigns.rowCount,1);assert.equal(clientCampaigns.rows[0].id,d.campaign);
    assert.deepEqual(Object.keys(clientCampaigns.rows[0]).sort(),["brand","id","name"]);
    for(const table of ["campaigns","artifact_revisions","artifact_dependencies","upload_sessions","asset_revisions","asset_publications","audit_events","outbox"]) assert.equal((await as("client",`select * from public.${table}`)).rowCount,0,`Client internals: ${table}`);
    results.push("RLS: tenant isolation, AD assignment, same-tenant unassigned client denied; allowlisted client campaign projection");
    await rejected("client","update public.campaigns set name='forged' where id=$1",[d.campaign]);
    await rejected("producer","select * from app_private.tenant_members");
    await rejected("client","select public.create_campaign($1,'forged','forged')",[d.tenant]);
    await rejected("producer","select public.create_campaign($1,'forged','forged')",[d.otherTenant]);
    const anonymous=await pool.connect();try{await anonymous.query("begin");await anonymous.query("set local role anon");await assert.rejects(()=>anonymous.query("select * from public.campaigns"),(e:unknown)=>(e as {code?:string}).code==="42501");}finally{await anonymous.query("rollback");anonymous.release();}
    const forged=await client.auth.updateUser({data:{role:"owner",tenant_id:d.otherTenant}});assert.equal(forged.error,null);
    assert.equal((await client.rpc("create_campaign",{target_tenant:d.tenant,campaign_name:"forged",brand_name:"forged"})).error?.code,"42501");
    const session=(await client.auth.getSession()).data.session;assert.ok(session);
    const fake=createClient(config.url,config.key,{global:{headers:{Authorization:`Bearer ${session.access_token.slice(0,-6)}forged`}},auth:{persistSession:false,autoRefreshToken:false}});
    assert.ok((await fake.from("campaigns").select("id")).error);
    results.push("Direct writes, private membership reads, forged user metadata/JWT and anonymous access denied");
    await rejected("client","select public.set_campaign_access($1,$2,true)",[d.privateCampaign,credentials.client.id]);
    await rejected("producer","select public.set_campaign_access($1,$2,true)",[d.privateCampaign,credentials.other.id],"22023");
    await rejected("worker","select * from public.campaign_access($1)",[d.campaign]);
    const membership=await pool.connect();try{
      await membership.query("begin");await membership.query("set local role authenticated");
      await membership.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials.producer.id]);
      await membership.query("select public.set_campaign_access($1,$2,true)",[d.privateCampaign,credentials.client.id]);
      await membership.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials.client.id]);
      assert.equal((await membership.query("select * from public.client_campaigns()")).rowCount,2);
      await membership.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials.producer.id]);
      await membership.query("select public.set_campaign_access($1,$2,false)",[d.privateCampaign,credentials.client.id]);
      await membership.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials.client.id]);
      assert.equal((await membership.query("select * from public.client_campaigns()")).rowCount,1);
    }finally{await membership.query("rollback");membership.release();}
    results.push("Producer-only campaign assignment/revocation applies immediately; cross-tenant targets and worker/client escalation denied");


    const campaign=(await producer.from("campaigns").select("version").eq("id",d.campaign).single()).data;assert.ok(campaign);
    const note=await producer.rpc("append_artifact",{target_campaign:d.campaign,expected_version:campaign.version,artifact_payload:{schemaVersion:"1.0",note:"M02 internal isolation test · never visible to clients"}});assert.equal(note.error,null);
    await rejected("producer","select public.append_artifact($1,$2::jsonb,null)",[d.campaign,JSON.stringify({schemaVersion:"1.0",note:"stale"})],"40001");
    await rejected("producer","select public.append_artifact($1,'{}'::jsonb,$2)",[d.campaign,Number(campaign.version)+1],"22023");
    await assert.rejects(()=>pool.query("update public.artifact_revisions set payload='{}'::jsonb where id=$1",[note.data]),/IMMUTABLE_REVISION/);
    await assert.rejects(()=>pool.query("insert into public.artifact_revisions(tenant_id,campaign_id,artifact_key,revision_no,kind,schema_version,payload,payload_sha256,created_by) values($1,$2,$3,1,'internal_note','1.0','{}',$4,$5)",[d.otherTenant,d.campaign,randomUUID(),"0".repeat(64),credentials.producer.id]),(e:unknown)=>(e as {code?:string}).code==="23503");
    const events=await pool.query("select e.id,o.id as outbox_id from public.audit_events e left join public.outbox o on o.event_id=e.id where e.subject_id=$1",[note.data]);assert.equal(events.rowCount,1);assert.ok(events.rows[0].outbox_id);
    results.push("Immutable artifact, optimistic version checks, composite foreign keys and atomic audit/outbox");

    const store=objectStore();const bytes=readFileSync("public/fixtures/tone.wav");
    const start=async(payload=bytes,mime="audio/wav",requestId=randomUUID())=>{
      const args={target_campaign:d.campaign,request_id:requestId,file_name:`reference-${requestId}.wav`,file_mime:mime,file_bytes:payload.length};
      const result=await producer.rpc("start_upload",args);assert.equal(result.error,null);return {task:result.data,args};
    };
    const upload=await start();const repeated=await producer.rpc("start_upload",upload.args);assert.equal(repeated.data.id,upload.task.id);
    assert.equal((await producer.rpc("start_upload",{...upload.args,file_name:"different.wav"})).error?.code,"22023");
    await rejected("producer","select public.start_upload($1,$2,'foreign.wav','audio/wav',100)",[d.otherCampaign,randomUUID()]);
    await rejected("client","select public.start_upload($1,$2,'forged.wav','audio/wav',100)",[d.campaign,randomUUID()]);
    await rejected("producer","select public.share_reference($1,true)",[upload.task.id],"22023");
    assert.equal((await client.rpc("asset_read_record",{target_asset:upload.task.id})).data?.length,0);
    await assert.rejects(()=>store.signPut("media/test/final.wav","audio/wav",60),/FINAL_KEY_NOT_WRITABLE/);
    assert.throws(()=>store.signGet(upload.task.staging_key,"staging.wav"),/STAGING_NOT_READABLE/);
    const url=await store.signPut(upload.task.staging_key,"audio/wav",120);
    const tampered=new URL(url);tampered.pathname+="-forged";assert.equal((await fetch(tampered,{method:"PUT",headers:{"Content-Type":"audio/wav"},body:bytes})).status,403);
    const put=await fetch(url,{method:"PUT",headers:{"Content-Type":"audio/wav"},body:bytes});assert.ok(put.ok,"Actual presigned PUT");
    const queued=await producer.rpc("finish_upload",{target_upload:upload.task.id});assert.equal(queued.error,null);
    await rejected("worker","select public.begin_promotion($1,null,$2,'audio/wav',$3,'{}')",[upload.task.id,digestBytes(bytes),bytes.length]);
    const rendered=await validateNextUpload(worker);assert.equal(rendered?.id,upload.task.id);assert.equal(rendered?.state,"ready");
    const asset=(await producer.from("asset_revisions").select("*").eq("id",upload.task.id).single()).data;assert.ok(asset);assert.equal(asset.sha256,digestBytes(bytes));assert.ok(asset.object_key.startsWith("media/"));
    const downloaded=await fetch(await store.signGet(asset.object_key,asset.filename));assert.equal(digestBytes(Buffer.from(await downloaded.arrayBuffer())),asset.sha256);
    const range=await fetch(await store.signGet(asset.object_key,asset.filename),{headers:{Range:"bytes=0-31"}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
    const cors=await fetch(url,{method:"OPTIONS",headers:{Origin:"http://localhost:3000","Access-Control-Request-Method":"PUT","Access-Control-Request-Headers":"content-type"}});assert.ok(cors.ok);assert.ok(["*","http://localhost:3000"].includes(cors.headers.get("access-control-allow-origin") ?? ""));
    results.push("Presigned staging PUT, tamper rejection, local ffprobe/full decode/SHA-256, promoted download, Range and local CORS");

    const oldPut=await fetch(url,{method:"PUT",headers:{"Content-Type":"audio/wav"},body:Buffer.alloc(bytes.length,42)});assert.ok(oldPut.ok,"Old staging bearer remains reusable until expiry");
    assert.equal(digestBytes((await store.get(asset.object_key)).body),asset.sha256,"Old PUT cannot change final bytes");
    assert.equal((await client.rpc("asset_read_record",{target_asset:asset.id})).data?.length,0);
    assert.equal((await producer.rpc("share_reference",{target_asset:asset.id,confirm_rights:false})).error?.code,"22023");
    assert.equal((await worker.rpc("share_reference",{target_asset:asset.id,confirm_rights:true})).error?.code,"42501");
    assert.equal((await producer.rpc("share_reference",{target_asset:asset.id,confirm_rights:true})).error,null);
    assert.equal((await producer.rpc("share_reference",{target_asset:asset.id,confirm_rights:true})).error,null);
    const shared=(await client.rpc("client_assets",{target_campaign:d.campaign})).data;const reference=shared?.find((a:{id:string})=>a.id===asset.id);assert.ok(reference);
    assert.deepEqual(Object.keys(reference).sort(),["bytes","filename","id","mime","sha256","shared_at"]);
    const stranger=await login("stranger");assert.equal((await stranger.rpc("asset_read_record",{target_asset:asset.id})).data?.length,0);
    const other=await login("other");assert.equal((await other.rpc("asset_read_record",{target_asset:asset.id})).data?.length,0);
    assert.equal((await as("client","select * from public.asset_revisions")).rowCount,0);
    results.push("Reusable old PUT cannot substitute final bytes; rights confirmation, exact reference sharing, worker/client/campaign isolation");

    const malformed=await start(Buffer.alloc(64,42)); await fetch(await store.signPut(malformed.task.staging_key,"audio/wav",60),{method:"PUT",headers:{"Content-Type":"audio/wav"},body:Buffer.alloc(64,42)});await producer.rpc("finish_upload",{target_upload:malformed.task.id});
    const invalid=await validateNextUpload(worker);assert.equal(invalid?.state,"rejected");assert.equal((await producer.from("asset_revisions").select("id").eq("id",malformed.task.id)).data?.length,0);
    assert.equal((await producer.rpc("share_reference",{target_asset:malformed.task.id,confirm_rights:true})).error?.code,"22023");
    results.push("Forged MIME/malformed bytes quarantined; no validated revision or client sharing possible");

    const interrupted=await start();await fetch(await store.signPut(interrupted.task.staging_key,"audio/wav",60),{method:"PUT",headers:{"Content-Type":"audio/wav"},body:bytes});await producer.rpc("finish_upload",{target_upload:interrupted.task.id});
    await assert.rejects(()=>validateNextUpload(worker,{afterPromotion:()=>{throw new Error("SIMULATED_PROCESS_CRASH");}}),/SIMULATED_PROCESS_CRASH/);
    const held=(await pool.query("select * from public.upload_sessions where id=$1",[interrupted.task.id])).rows[0];assert.equal(held.state,"promoting");assert.ok(held.final_key);
    await pool.query("update public.upload_sessions set lease_until=now()-interval '1 second' where id=$1",[held.id]);
    const reclaimed=await worker.rpc("claim_upload");assert.equal(reclaimed.data.id,held.id);assert.notEqual(reclaimed.data.lease_token,held.lease_token);
    assert.equal((await worker.rpc("mark_validating",{target_upload:held.id,token:held.lease_token})).error?.code,"42501");
    await pool.query("update public.upload_sessions set lease_until=now()-interval '1 second' where id=$1",[held.id]);
    const resumed=await validateNextUpload(worker);assert.equal(resumed?.state,"ready");
    assert.equal((await pool.query("select id from public.asset_revisions where upload_session_id=$1",[held.id])).rowCount,1);
    assert.equal((await pool.query("select id from public.audit_events where subject_id=$1 and event_type='asset.validated'",[held.id])).rowCount,1);
    results.push("Crash after promotion recovers without duplicate asset/event; stale lease completion rejected");

    const quota=await pool.connect();try{await quota.query("begin");await quota.query("set local role authenticated");await quota.query("select set_config('request.jwt.claim.sub',$1,true)",[credentials.producer.id]);for(let i=0;i<10;i++)await quota.query("select public.start_upload($1,$2,'quota.wav','audio/wav',1)",[d.privateCampaign,randomUUID()]);await assert.rejects(()=>quota.query("select public.start_upload($1,$2,'quota.wav','audio/wav',1)",[d.privateCampaign,randomUUID()]),(e:unknown)=>(e as {code?:string}).code==="54000");}finally{await quota.query("rollback");quota.release();}
    const expired=await start();await pool.query("update public.upload_sessions set expires_at=now()-interval '2 minutes' where id=$1",[expired.task.id]);
    await pool.query("update public.upload_sessions set expires_at=now()-interval '2 minutes' where id in ($1,$2,$3)",[asset.id,malformed.task.id,held.id]);
    const cleaned=await cleanupUploads(worker);assert.ok(cleaned>=4);assert.equal((await pool.query("select state from public.upload_sessions where id=$1",[expired.task.id])).rows[0].state,"expired");
    await assert.rejects(()=>store.get(upload.task.staging_key));assert.equal(digestBytes((await store.get(asset.object_key)).body),asset.sha256);
    const orphanEvents=await pool.query("select count(*)::int as n from public.audit_events a left join public.outbox o on o.event_id=a.id where o.id is null");assert.equal(orphanEvents.rows[0].n,0);
    results.push("Upload admission quota, expired staging cleanup and atomic audit/outbox consistency");
    const concurrent=await Promise.all(Array.from({length:12},()=>producer.rpc("start_upload",{target_campaign:d.privateCampaign,request_id:randomUUID(),file_name:"concurrent.wav",file_mime:"audio/wav",file_bytes:1})));
    const admitted=concurrent.filter((r)=>!r.error);assert.equal(admitted.length,10);assert.equal(concurrent.filter((r)=>r.error?.code==="54000").length,2);
    for(const result of admitted)await pool.query("update public.upload_sessions set expires_at=now()-interval '2 minutes' where id=$1",[result.data.id]);
    await cleanupUploads(worker);results.push("Twelve concurrent upload admissions permit exactly ten active sessions");
    const version=(await pool.query("show server_version")).rows[0].server_version;
    const report={status:"passed",database:version,backend:"Native local Supabase Auth/Postgres/Storage S3; Cloudflare R2 not contacted",results,sampleAssetId:asset.id,errors:[]};
    writeFileSync("artifacts/m02/data-report.json",`${JSON.stringify(report,null,2)}\n`);console.log(JSON.stringify(report,null,2));
  } finally {for(const c of clients)await c.auth.signOut({scope:"local"});await pool.end();}
}
main().catch((error:unknown)=>{console.error(error instanceof Error ? error.message : "Data verification failed");process.exitCode=1;});
