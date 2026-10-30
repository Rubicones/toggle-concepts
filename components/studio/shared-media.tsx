"use client";
import {Select} from '@/components/ui/select';
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {studioRequest,useShared} from "@/lib/shared-http";
import {useStudio} from "@/lib/studio-store";
import {AssetActions} from "./asset-actions";
type Media={assets:{id:string;filename:string;mime:string;bytes:number;sha256:string}[];uploads:{id:string;filename:string;state:string;error_code:string|null}[]};
export function SharedMedia({campaignId}:{campaignId?:string}){
 const {data:workspace}=useStudio();const [selected,setSelected]=useState("");const campaign=campaignId||selected||workspace.campaigns[0]?.id;const {data,error,refresh}=useShared<Media>(`/api/studio/media${campaign?'?campaign='+campaign:''}`);const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 return <section className="detail-panel"><div className="section-heading"><span className="eyebrow">CAMPAIGN MEDIA</span><h2>References and image candidates.</h2><p>Files are stored privately in Supabase. Inspection starts automatically on the studio computer.</p></div>
 {!campaignId&&<label className="studio-form">Campaign<Select value={campaign??""} onChange={e=>setSelected(e.target.value)}>{workspace.campaigns.map(c=><option key={c.id} value={c.id}>{c.brand} · {c.name}</option>)}</Select></label>}
 {campaign&&<form className="studio-form" onSubmit={async e=>{e.preventDefault();setBusy(true);const form=e.currentTarget,fields=new FormData(form);fields.set("campaignId",campaign);try{const result=await studioRequest<{message:string}>("/api/studio/media","POST",fields);setMessage(result.message);form.reset();refresh();}catch(err){setMessage(err instanceof Error?err.message:"Upload failed.");}finally{setBusy(false);}}}><label>Choose a reference<input name="file" type="file" required accept="image/png,image/jpeg,image/webp,video/mp4,audio/wav,.wav"/></label><span className="muted">Up to 10 MiB · PNG, JPEG, WebP, H.264 MP4, PCM WAV</span><Button type="submit" disabled={busy}>{busy?"Uploading…":"Upload & validate"}</Button></form>}
 {!campaign&&<p>Create a campaign to add media.</p>}{error&&<p role="alert" className="form-error">{error}</p>}<p role="status">{message}</p>
 {data?.uploads.filter(u=>u.state!=="ready").map(u=><p key={u.id}>{u.filename} <Badge variant="outline">{u.state==='uploaded'?'Validation queued':u.state}</Badge>{u.error_code&&' · File rejected or expired. Use a supported file.'}</p>)}
 {data?.uploads.some(u=>['uploaded','promoting','validating'].includes(u.state))&&<Button variant="outline" onClick={async()=>{try{const result=await studioRequest<{message:string}>("/api/studio/worker","POST");setMessage(result.message);}catch(e){setMessage(e instanceof Error?e.message:"Could not start validation.");}}}>Resume pending validation</Button>}
 <div className="shared-assets-grid">{data?.assets.map(a=><article className="shared-asset-card" key={a.id}><Badge variant="blue">Validated</Badge><h3>{a.filename}</h3><p>{a.mime} · {(a.bytes/1024).toFixed(1)} KiB</p><AssetActions assetId={a.id} image={a.mime.startsWith("image/")}/></article>)}</div><p className="muted">Shared workspace: everyone using this app can access these campaign records and validated references. Account separation will be enabled later.</p></section>;
}
