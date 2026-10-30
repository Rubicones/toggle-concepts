// Trusted local process only. Never import into Next.js routes or creative components.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Decoders inspect untrusted bytes without inheriting Auth, S3 or provider secrets.
const decoderEnv={NODE_ENV:"production" as const,PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,LANG:"C",SystemRoot:process.env.SystemRoot};
let toolsChecked=false;
export function ensureInspectionTools() {
  if(toolsChecked)return;
  for(const tool of ["ffprobe","ffmpeg"]) {
    const result=spawnSync(tool,["-version"],{env:decoderEnv,encoding:"utf8",timeout:3000,maxBuffer:128*1024});
    if(result.status!==0)throw new Error("MEDIA_TOOLS_UNAVAILABLE");
  }
  toolsChecked=true;
}
export function sniffMime(bytes: Buffer): string {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP") return "image/webp";
  if (bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WAVE") return "audio/wav";
  if (bytes.toString("ascii",4,8)==="ftyp") return "video/mp4";
  throw new Error("ASSET_VALIDATION_FAILED");
}
export function inspectMedia(bytes: Buffer, claimedMime: string, claimedBytes: number) {
  if (bytes.length<12 || bytes.length!==claimedBytes || bytes.length>10*1024*1024) throw new Error("ASSET_VALIDATION_FAILED");
  const mime=sniffMime(bytes); if (mime!==claimedMime) throw new Error("ASSET_VALIDATION_FAILED");
  const folder=mkdtempSync(join(tmpdir(),"toggle-inspect-")); const path=join(folder,"input");
  try {
    writeFileSync(path,bytes,{mode:0o600});
    const probe=spawnSync("ffprobe",["-v","error","-max_alloc","134217728","-protocol_whitelist","file,pipe","-show_entries","stream=codec_type,codec_name,width,height,sample_rate,channels:format=duration","-of","json",path],{env:decoderEnv,encoding:"utf8",timeout:10000,maxBuffer:256*1024});
    if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("MEDIA_TOOLS_UNAVAILABLE");
    if (probe.status!==0) throw new Error("ASSET_VALIDATION_FAILED");
    const info=JSON.parse(probe.stdout); const streams=info.streams as {codec_type:string;codec_name:string;width?:number;height?:number;sample_rate?:string;channels?:number}[];
    const video=streams.filter((s)=>s.codec_type==="video"); const audio=streams.filter((s)=>s.codec_type==="audio"); const duration=Number(info.format?.duration ?? 0);
    if (!streams.length || streams.length>2 || streams.some((s)=>!["video","audio"].includes(s.codec_type))) throw new Error("ASSET_VALIDATION_FAILED");
    if (mime.startsWith("image/")) {
      if (video.length!==1 || audio.length || !["png","mjpeg","webp"].includes(video[0].codec_name)) throw new Error("ASSET_VALIDATION_FAILED");
    } else if (!Number.isFinite(duration) || duration<=0 || duration>60 || (mime==="video/mp4" && (video.length!==1 || video[0].codec_name!=="h264" || audio.some((s)=>s.codec_name!=="aac"))) || (mime==="audio/wav" && (video.length || audio.length!==1 || !["pcm_s16le","pcm_s24le","pcm_f32le"].includes(audio[0].codec_name)))) throw new Error("ASSET_VALIDATION_FAILED");
    for (const s of video) {
      const width=s.width ?? 0,height=s.height ?? 0;
      if (!width || !height || width>8192 || height>8192 || width*height>16_777_216 || (mime==="video/mp4" && (width>1920 || height>1920 || width*height>2_073_600))) throw new Error("ASSET_VALIDATION_FAILED");
    }
    if (audio.some((s)=>!s.channels || s.channels>2 || Number(s.sample_rate)>48000)) throw new Error("ASSET_VALIDATION_FAILED");
    const decoded=spawnSync("ffmpeg",["-nostdin","-v","error","-threads","1","-max_alloc","134217728","-protocol_whitelist","file,pipe","-i",path,"-f","null","-"],{env:decoderEnv,encoding:"utf8",timeout:15000,maxBuffer:256*1024});
    if (decoded.error && (decoded.error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("MEDIA_TOOLS_UNAVAILABLE");
    if (decoded.status!==0 || decoded.stderr.trim()) throw new Error("ASSET_VALIDATION_FAILED");
    return { sha256:createHash("sha256").update(bytes).digest("hex"), mime, bytes:bytes.length,
      metadata:{width:video[0]?.width ?? null,height:video[0]?.height ?? null,durationSeconds:duration || null,streams:streams.map((s)=>({type:s.codec_type,codec:s.codec_name,channels:s.channels ?? null,sampleRate:s.sample_rate ? Number(s.sample_rate) : null}))} };
  } finally {rmSync(folder,{recursive:true,force:true});}
}
