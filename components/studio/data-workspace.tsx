"use client";
import {Select} from '@/components/ui/select';
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { ArrowRight, Check, Download, FileText, FolderOpen, LogOut, RefreshCw, ShieldCheck, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {subscribeStudioChanges} from '@/lib/studio-events';
import { clientResponseSchema, workspaceResponseSchema, accessResponseSchema, readAccessSchema, uploadAccessSchema, type WorkspaceResponse } from "@/packages/contracts/data";

class RequestError extends Error { constructor(public code:string,message:string) {super(message);} }
async function request(path:string,init?:RequestInit) {
  const response=await fetch(path,{...init,cache:"no-store"}); const data=await response.json();
  if (!response.ok) throw new RequestError(data.code ?? "UNAVAILABLE",data.message ?? "The request could not be completed.");
  return data;
}
const post=(path:string,data?:unknown)=>request(path,{method:"POST",...(data ? {headers:{"Content-Type":"application/json"},body:JSON.stringify(data)} : {})});
function useRemote<T>(path:string,schema:z.ZodType<T>) {
  const [snapshot,setSnapshot]=useState<{path:string;data:T}|null>(null); const [failure,setFailure]=useState<{path:string;message:string}|null>(null);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(async()=>{setRevision((value)=>value+1);},[]);
  useEffect(()=>{
    let active=true; let timer:ReturnType<typeof setTimeout>; const controller=new AbortController();
    const load=async()=>{
      try {
        const data=schema.parse(await request(path,{signal:controller.signal}));
        if(active){setSnapshot({path,data});setFailure(null);}
      } catch(error) {
        if(!active)return;
        if(error instanceof RequestError && error.code==="SIGN_IN_REQUIRED"){window.location.replace("/login");return;}
        if(error instanceof RequestError && error.code==="CLIENT_PORTAL"){window.location.replace("/portal");return;}
        setFailure({path,message:error instanceof Error ? error.message : "The local data service is unavailable."});
      }
    };
    const unsubscribe=subscribeStudioChanges(path,()=>{clearTimeout(timer);timer=setTimeout(()=>void load(),300);});
    timer=setTimeout(()=>void load(),0);return()=>{active=false;clearTimeout(timer);controller.abort();unsubscribe();};
  },[path,schema,revision]);
  return {data:snapshot?.path===path ? snapshot.data : null,error:failure?.path===path ? failure.message : "",refresh};
}
export function SignOutButton() {
  const [error,setError]=useState("");
  return <><Button variant="outline" size="sm" onClick={async()=>{try{await post("/api/auth/sign-out");window.location.replace("/login");}catch(error){setError(error instanceof Error ? error.message : "Sign-out failed.");}}}><LogOut size={15}/>Sign out</Button>{error && <span role="alert" className="form-error">{error}</span>}</>;
}
export function LoginPage() {
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const [passwordMode,setPasswordMode]=useState(false),[sent,setSent]=useState(false);
  return <div className="login-layout"><section className="login-intro"><span className="eyebrow">A SPACE FOR GOOD WORK</span><h1>Your studio.<br/>Your next idea.</h1><p>Sign in to work with your team or review the references shared with you.</p><div className="login-mark" aria-hidden="true"><span/></div><p className="login-note">Creative direction stays human.<br/>Every version stays connected.</p></section>
    <section className="login-form-panel"><Badge variant="blue">Workspace access</Badge><h2>{sent ? "Check your inbox." : "Good to see you."}</h2><p>{passwordMode ? "Use your assigned studio or client account." : "Enter your account email. We’ll send you a secure sign-in link."}</p>
      <form className="studio-form" onSubmit={async(event)=>{
        event.preventDefault();setBusy(true);setMessage("");const form=new FormData(event.currentTarget);
        try{
          if(passwordMode){const result=await post("/api/auth/sign-in",{email:form.get("email"),password:form.get("password")});window.location.replace(result.destination);}
          else{const result=await post("/api/auth/magic-link",{email:form.get("email")});setSent(true);setMessage(result.message);setBusy(false);}
        }catch(error){setMessage(error instanceof Error ? error.message : "Sign-in failed.");setBusy(false);setSent(false);}
      }}><label>Email<input name="email" type="email" autoComplete="username" required maxLength={200} placeholder="you@studio.com" disabled={busy}/></label>
        {passwordMode && <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={200} placeholder="Your password" disabled={busy}/></label>}
        {message && <p role={sent ? "status" : "alert"} className={sent ? "auth-sent-message" : "form-error"}>{message}</p>}
        <Button type="submit" disabled={busy}>{busy ? (passwordMode ? "Signing in…" : "Sending link…") : passwordMode ? "Sign in" : sent ? "Send another link" : "Email me a sign-in link"}<ArrowRight size={16}/></Button>
      </form>
      <button type="button" className="text-link auth-mode-switch" disabled={busy} onClick={()=>{setPasswordMode(!passwordMode);setSent(false);setMessage("");}}>{passwordMode ? "Use a magic link instead" : "Use a password instead"}</button>
      <p className="login-local-note"><ShieldCheck size={17}/><span>Access is for existing studio and client accounts. Contact your studio if you need an account.</span></p><Link className="text-link" href="/">Continue without signing in<ArrowRight size={14}/></Link>
    </section></div>;
}

async function downloadAsset(id:string) {
  const access=readAccessSchema.parse(await post(`/api/secure/assets/${id}/read-access`));
  const response=await fetch(access.url,{cache:"no-store"}); if (!response.ok || !response.body) throw new Error("The download link expired or storage is unavailable. Try again.");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>10*1024*1024 || bytes>access.bytes){await reader.cancel();throw new Error("The downloaded size does not match this revision.");}chunks.push(part.value);}
  const buffer=new Uint8Array(bytes);let position=0;for(const chunk of chunks){buffer.set(chunk,position);position+=chunk.byteLength;}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).map((v)=>v.toString(16).padStart(2,"0")).join("");
  if (bytes!==access.bytes || hash!==access.sha256) throw new Error("The file does not match the recorded revision. Download stopped.");
  const url=URL.createObjectURL(new Blob([buffer],{type:access.mime})); const link=document.createElement("a");link.href=url;link.download=access.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bytesLabel(bytes:number) {return bytes<1024 ? `${bytes} B` : bytes<1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;}

export function DataWorkspacePage() {
  const router=useRouter(), search=useSearchParams(); const selected=search.get("campaign") ?? "";
  const setSelected=(id:string)=>router.replace(`/workspace?campaign=${id}`,{scroll:false});
  const {data,error,refresh}=useRemote(`/api/secure/workspace${selected ? `?campaign=${selected}` : ""}`,workspaceResponseSchema);
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);const [sharing,setSharing]=useState<string|null>(null);const [newCampaign,setNewCampaign]=useState(false);const [manageAccess,setManageAccess]=useState(false);
  const campaign=data?.campaigns.find((c)=>c.id===selected) ?? data?.campaigns[0];
  const createTenants=data?.memberships.filter((m)=>["owner","producer"].includes(m.role)) ?? [];
  return <><div className="page-heading"><div><p className="eyebrow">THE SHARED WORKSPACE</p><h1>Make room for the team.</h1><p>Campaign records and media, connected to your account.</p></div><div className="data-heading-actions"><SignOutButton/><Button variant="outline" onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh</Button></div></div>
    {error && <div className="notice notice-error" role="alert">{error} <Link href="/login">Open sign-in</Link></div>}
    {!data && !error && <p role="status">Loading your workspace…</p>}
    {data && <><div className="connected-strip"><span><ShieldCheck size={17}/>Authenticated workspace</span><span>{data.email}</span><Link href="/portal" prefetch={false}>Preview client portal<ArrowRight size={14}/></Link></div>
      <div className="data-campaign-toolbar"><label>Campaign<Select aria-label="Shared campaign" value={campaign?.id ?? ""} onChange={(event)=>{setSelected(event.target.value);setMessage("");}}>{data.campaigns.map((c)=><option value={c.id} key={c.id}>{c.brand} · {c.name}</option>)}</Select></label>{createTenants.length>0 && <div className="data-heading-actions">{campaign && createTenants.some((t)=>t.tenant_id===campaign.tenant_id) && <Button variant="outline" onClick={()=>setManageAccess(true)}><Users size={15}/>Manage access</Button>}<Button variant="outline" onClick={()=>setNewCampaign(true)}>New shared campaign<ArrowRight size={15}/></Button></div>}</div>
      {campaign ? <><section className="data-campaign-heading"><span className="eyebrow">{campaign.brand}</span><h2>{campaign.name}</h2><p>Private campaign workspace. Local M01 notes remain in their original browser.</p></section>
        <div className="data-workspace-grid"><section className="detail-panel upload-panel"><span className="panel-icon"><Upload size={22}/></span><h2>Bring your references.</h2><p>Upload a small image, video, or audio file. A separate local validator checks the actual bytes before the file becomes available.</p><form className="studio-form" onSubmit={async(event)=>{
          event.preventDefault();setBusy(true);setMessage("");const form=event.currentTarget;const file=new FormData(form).get("file");
          try{
            if (!(file instanceof File) || !file.size) throw new Error("Choose a file first.");
            const mime=file.type==="audio/x-wav" || file.name.toLowerCase().endsWith(".wav") ? "audio/wav" : file.type;
            const access=uploadAccessSchema.parse(await post("/api/secure/uploads/sessions",{schemaVersion:"1.0",campaignId:campaign.id,requestId:crypto.randomUUID(),filename:file.name,mime,bytes:file.size}));
            const put=await fetch(access.url,{method:"PUT",headers:access.headers,body:file});if(!put.ok)throw new Error("Storage could not accept this upload. Check the local service and try a new session.");
            await post(`/api/secure/uploads/${access.id}/finalize`);form.reset();setMessage("Uploaded to staging. Waiting for the local validator.");await refresh();
          }catch(error){setMessage(error instanceof Error ? error.message : "Upload failed.");}finally{setBusy(false);}
        }}><label>Choose a reference<input type="file" name="file" accept="image/png,image/jpeg,image/webp,video/mp4,audio/wav,.wav" required/></label><span className="muted">Up to 10 MiB · PNG, JPEG, WebP, H.264 MP4, PCM WAV</span><Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload for validation"}<Upload size={15}/></Button></form><p className="muted">Use the media library to upload and validate references automatically.</p></section>
        <section className="detail-panel internal-notes"><span className="panel-icon"><FileText size={22}/></span><h2>A note for the studio.</h2><p>Internal notes are immutable records. Clients cannot read them.</p><form className="studio-form" onSubmit={async(event)=>{event.preventDefault();const form=event.currentTarget;try{await post("/api/secure/artifacts",{campaignId:campaign.id,expectedVersion:campaign.version,note:new FormData(form).get("note")});form.reset();setMessage("Internal note saved. Audit and outbox recorded together.");await refresh();}catch(error){setMessage(error instanceof Error ? error.message : "Could not save the note.");}}}><label>Internal note<textarea name="note" rows={4} required maxLength={4000} placeholder="Context for the team, never part of a client preview."/></label><Button variant="outline" type="submit">Save internal note<Check size={15}/></Button></form><div className="saved-notes">{data.notes.slice(0,3).map((note)=><article key={note.id}><span>INTERNAL · {new Date(note.created_at).toLocaleDateString("en-GB")}</span><p>{note.payload.note}</p></article>)}</div></section></div>
        <p className="status-message" role="status">{message}</p><div className="section-heading"><span className="eyebrow">MEDIA & VALIDATION</span><h2>Every file, accounted for.</h2><p>Validated files stay private until you explicitly share a reference. Sharing is not an art director or client production approval.</p></div>
        {data.uploads.some((u)=>u.state!=="ready") && <div className="upload-status-list">{data.uploads.filter((u)=>u.state!=="ready").map((u)=><div key={u.id}><FileText size={16}/><strong>{u.filename}</strong><Badge variant={u.state==="rejected" ? "outline" : "blue"}>{u.state==="uploaded" ? "Waiting for validator" : u.state}</Badge>{u.error_code && <span>{u.state==="expired" ? "Session expired. Start a new upload." : "Validation failed. Use a supported file and upload again."}</span>}</div>)}</div>}
        {data.assets.length ? <div className="shared-assets-grid">{data.assets.map((asset)=>{const shared=data.publications.some((p)=>p.asset_revision_id===asset.id);return <article className="shared-asset-card" key={asset.id}><div className="shared-asset-top"><FileText size={24}/><Badge variant={shared ? "blue" : "outline"}>{shared ? "Shared reference" : "Private · validated"}</Badge></div><h3>{asset.filename}</h3><p>{asset.mime} · {bytesLabel(asset.bytes)}</p><code>SHA-256 · {asset.sha256.slice(0,14)}…</code><div><Button size="sm" variant="outline" onClick={async()=>{try{await downloadAsset(asset.id);setMessage("Downloaded and verified SHA-256.");}catch(error){setMessage(error instanceof Error ? error.message : "Download failed.");}}}><Download size={14}/>Download</Button>{!shared && <Button size="sm" onClick={()=>{setMessage("");setSharing(asset.id);}}>Share reference<Users size={14}/></Button>}</div></article>;})}</div> : <div className="empty-view"><FolderOpen size={30}/><h2>No validated files yet.</h2><p>Upload a reference, then start the local validator. Files appear here after validation completes.</p></div>}
      </> : <div className="empty-view"><FolderOpen size={30}/><h2>No campaigns are assigned yet.</h2><p>A producer can create a shared campaign. Other studio roles need a campaign assignment.</p></div>}
      <div className="workspace-footnote">AI remains in mock mode. No generation, production approvals, or paid requests start here.</div>
      <Dialog open={sharing!==null} onOpenChange={(open)=>{if(!open)setSharing(null);}}><DialogContent><DialogTitle>Share a reference.</DialogTitle><DialogDescription>Give the assigned campaign clients access to this exact validated revision. Internal notes and other files remain private. This does not approve a production deliverable.</DialogDescription><form className="studio-form" onSubmit={async(event)=>{event.preventDefault();try{await post(`/api/secure/assets/${sharing}/share`,{confirmRights:true});setSharing(null);setMessage("Reference shared with assigned campaign clients.");await refresh();}catch(error){setMessage(error instanceof Error ? error.message : "Sharing failed.");}}}><label className="checkbox-field"><input type="checkbox" required/><span>I confirm we have permission to share this reference.</span></label><Button type="submit">Share reference<ArrowRight size={15}/></Button></form>{message && <p role="alert" className="form-error">{message}</p>}</DialogContent></Dialog>
      {manageAccess && campaign && <CampaignAccess campaignId={campaign.id} onClose={()=>setManageAccess(false)}/>}
      <NewSharedCampaign open={newCampaign} onClose={()=>setNewCampaign(false)} data={data} onCreated={async(id)=>{setSelected(id);await refresh();}}/>
    </>}
  </>;
}
function NewSharedCampaign({open,onClose,data,onCreated}:{open:boolean;onClose:()=>void;data:WorkspaceResponse;onCreated:(id:string)=>Promise<void>}) {
  const [error,setError]=useState("");
  return <Dialog open={open} onOpenChange={(open)=>{if(!open)onClose();}}><DialogContent><DialogTitle>A new shared workspace.</DialogTitle><DialogDescription>Create a campaign in a studio you manage. This does not submit C1 or add client access automatically.</DialogDescription><form className="studio-form" onSubmit={async(event)=>{event.preventDefault();setError("");const form=new FormData(event.currentTarget);try{const created=await post("/api/secure/campaigns",{tenantId:form.get("tenant"),name:form.get("name"),brand:form.get("brand")});onClose();await onCreated(created.id);}catch(error){setError(error instanceof Error ? error.message : "Campaign creation failed.");}}}><label>Studio<Select name="tenant">{data.memberships.filter((m)=>["owner","producer"].includes(m.role)).map((m)=><option key={m.tenant_id} value={m.tenant_id}>{m.tenant_name}</option>)}</Select></label><label>Campaign name<input name="name" required maxLength={80}/></label><label>Brand<input name="brand" required maxLength={60}/></label>{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit">Create shared campaign<ArrowRight size={15}/></Button></form></DialogContent></Dialog>;
}
export function ClientPortalPage() {
  const router=useRouter(), search=useSearchParams(); const selected=search.get("campaign") ?? ""; const setSelected=(id:string)=>router.replace(`/portal?campaign=${id}`,{scroll:false}); const {data,error,refresh}=useRemote(`/api/secure/portal${selected ? `?campaign=${selected}` : ""}`,clientResponseSchema);const [message,setMessage]=useState("");
  const campaign=data?.campaigns.find((c)=>c.id===selected) ?? data?.campaigns[0];
  return <><div className="page-heading"><div><p className="eyebrow">YOUR CREATIVE SPACE</p><h1>A clear view of the work.</h1><p>References shared with you, all in one place.</p></div><SignOutButton/></div>{error && <p className="notice notice-error" role="alert">{error}</p>}{!data && !error && <p role="status">Loading your campaigns…</p>}{data && <><div className="connected-strip"><span><ShieldCheck size={17}/>Client access</span><span>{data.email}</span><Button variant="ghost" size="sm" onClick={()=>void refresh()}><RefreshCw size={14}/>Refresh</Button></div>{campaign ? <><div className="data-campaign-toolbar"><label>Campaign<Select aria-label="Client campaign" value={campaign.id} onChange={(e)=>setSelected(e.target.value)}>{data.campaigns.map((c)=><option key={c.id} value={c.id}>{c.brand} · {c.name}</option>)}</Select></label></div><section className="portal-welcome"><span className="eyebrow">{campaign.brand}</span><h2>{campaign.name}</h2><p>Your team will share references here. Creative reviews will follow at the agreed client checkpoints.</p><span>C1 · Brief & scope <ArrowRight size={14}/> C2 · Three drafts <ArrowRight size={14}/> C3 · Final results</span></section>{data.assets.length ? <div className="shared-assets-grid">{data.assets.map((asset)=><article className="shared-asset-card" key={asset.id}><div className="shared-asset-top"><FileText size={25}/><Badge variant="blue">Shared reference</Badge></div><h3>{asset.filename}</h3><p>{asset.mime} · {bytesLabel(asset.bytes)}</p><Button variant="outline" onClick={async()=>{try{await downloadAsset(asset.id);setMessage("Downloaded and verified SHA-256.");}catch(error){setMessage(error instanceof Error ? error.message : "Download failed.");}}}><Download size={15}/>Download reference</Button></article>)}</div> : <div className="empty-view"><FolderOpen size={30}/><h2>Your first references will appear here.</h2><p>Your team has not shared any files with this campaign yet.</p></div>}</> : <div className="empty-view"><FolderOpen size={30}/><h2>No campaigns are assigned yet.</h2><p>Ask your studio contact to assign your account to the right campaign.</p></div>}<p className="status-message" role="status">{message}</p></>}</>;
}

function CampaignAccess({campaignId,onClose}:{campaignId:string;onClose:()=>void}) {
  const {data,error,refresh}=useRemote(`/api/secure/campaign-access?campaign=${campaignId}`,accessResponseSchema);
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  return <Dialog open onOpenChange={(open)=>{if(!open)onClose();}}><DialogContent><DialogTitle>The right people, in the right space.</DialogTitle><DialogDescription>Assign existing studio members to this campaign. Clients only see shared references; art directors get studio access. Studio owners and producers already have access.</DialogDescription>
    {error && <p role="alert" className="form-error">{error}</p>}{!data && !error && <p role="status">Loading campaign access…</p>}
    <div className="campaign-access-list">{data?.map((member)=><label className="checkbox-field" key={member.user_id}><input key={`${member.user_id}:${member.assigned}`} type="checkbox" defaultChecked={member.assigned} disabled={busy} onChange={async(event)=>{const field=event.currentTarget,allowAccess=field.checked;setBusy(true);try{await post("/api/secure/campaign-access",{campaignId,userId:member.user_id,allowAccess});await refresh();setMessage("Campaign access updated.");}catch(error){field.checked=!allowAccess;setMessage(error instanceof Error ? error.message : "Could not update access.");}finally{setBusy(false);}}}/><span><strong>{member.email}</strong><small>{member.role==="client" ? "Client · shared references only" : "Art director · assigned studio access"}</small></span></label>)}</div><p className="status-message" role="status">{message}</p><p className="muted">Revocation blocks new access immediately. Download links already issued expire within 60 seconds.</p>
  </DialogContent></Dialog>;
}
