import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { adminClient } from "../data/shared-runtime";
import { storageConfig } from "../data/config.server";

export function objectStore() {
  if (process.env.MEDIA_BACKEND === "supabase") return supabaseObjectStore();
  const config = storageConfig();
  const client = new S3Client({ ...config, forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } });
  const key = (value: string) => { if (!/^(staging|media)\/[a-zA-Z0-9/.-]+$/.test(value) || value.includes("..")) throw new Error("INVALID_OBJECT_KEY"); return value; };
  const base = (value: string) => ({ Bucket: config.bucket, Key: key(value) });
  return {
    putStaging: (value: string, body: Buffer, mime: string) => client.send(new PutObjectCommand({ ...base(value), Body: body, ContentType: mime })),
    head: (value: string) => client.send(new HeadObjectCommand(base(value))),
    get: async (value: string) => {
      const result = await client.send(new GetObjectCommand(base(value)));
      // Local validator bounds the response while streaming; a forged Content-Length is insufficient.
      const chunks: Buffer[] = []; let bytes = 0;
      if (!result.Body) throw new Error("ASSET_VALIDATION_FAILED");
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        bytes += chunk.byteLength;
        if (bytes > (value.includes("/brand/")?50:10) * 1024 * 1024) { (result.Body as { destroy?: () => void }).destroy?.(); throw new Error("ASSET_VALIDATION_FAILED"); }
        chunks.push(Buffer.from(chunk));
      }
      return { body: Buffer.concat(chunks), etag: result.ETag };
    },
    promote: (to: string, body: Buffer, mime: string) => {
      if (!to.startsWith("media/")) throw new Error("INVALID_FINAL_KEY");
      return client.send(new PutObjectCommand({ ...base(to), Body: body, ContentType: mime, IfNoneMatch: "*" }));
    },
    delete: (value: string) => client.send(new DeleteObjectCommand(base(value))),
    signPut: async (value: string, mime: string, expiresIn: number) => {
      if (!value.startsWith("staging/")) throw new Error("FINAL_KEY_NOT_WRITABLE");
      return getSignedUrl(client, new PutObjectCommand({ ...base(value), ContentType: mime }), { expiresIn, signableHeaders: new Set(["content-type"]) });
    },
    signGet: (value: string, filename: string) => {
      if (!value.startsWith("media/")) throw new Error("STAGING_NOT_READABLE");
      return getSignedUrl(client, new GetObjectCommand({ ...base(value), ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }), { expiresIn: 60 });
    },
  };
}
export function isMissingObject(error: unknown) { return ["NoSuchKey", "NotFound"].includes((error as { name?: string })?.name ?? "") || (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404; }

function supabaseObjectStore() {
 const storage=adminClient().storage.from("studio-media");
 const storageError=(error:{message:string})=>{if(/not found|does not exist/i.test(error.message))return Object.assign(new Error("Storage object not found"),{name:"NotFound"});return new Error("STORAGE_UNAVAILABLE");};
 const valid=(key:string)=>{if(!/^(staging|media)\/[a-zA-Z0-9/.-]+$/.test(key)||key.includes(".."))throw new Error("INVALID_OBJECT_KEY");return key;};
 const upload=async(key:string,body:Buffer,mime:string)=>{const r=await storage.upload(valid(key),body,{contentType:mime,upsert:false});if(r.error){if(r.error.message.includes("already exists"))throw Object.assign(new Error("Precondition"),{$metadata:{httpStatusCode:412}});throw new Error("STORAGE_UNAVAILABLE");}return r.data;};
 return {
  putStaging:(key:string,body:Buffer,mime:string)=>{if(!key.startsWith("staging/"))throw new Error("INVALID_OBJECT_KEY");return upload(key,body,mime);},
  head:async(key:string)=>{const r=await storage.info(valid(key));if(r.error)throw storageError(r.error);return {ContentLength:r.data.size};},
  get:async(key:string)=>{const link=await storage.createSignedUrl(valid(key),30);if(link.error)throw storageError(link.error);const response=await fetch(link.data.signedUrl,{signal:AbortSignal.timeout(20000)});if(!response.ok||!response.body)throw new Error("STORAGE_UNAVAILABLE");const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>(key.includes("/brand/")?52428800:10485760)){await reader.cancel();throw new Error("ASSET_VALIDATION_FAILED");}chunks.push(part.value);}return {body:Buffer.concat(chunks),etag:""};},
  promote:(key:string,body:Buffer,mime:string)=>{if(!key.startsWith("media/"))throw new Error("INVALID_FINAL_KEY");return upload(key,body,mime);},
  delete:async(key:string)=>{const r=await storage.remove([valid(key)]);if(r.error)throw new Error("STORAGE_UNAVAILABLE");return r.data;},
  signPut:async()=>{throw new Error("USE_INTERFACE_UPLOAD");},
  signGet:async(key:string,filename:string)=>{if(!key.startsWith("media/"))throw new Error("STAGING_NOT_READABLE");const r=await storage.createSignedUrl(valid(key),60,{download:filename});if(r.error)throw new Error("STORAGE_UNAVAILABLE");return r.data.signedUrl;},
 };
}
