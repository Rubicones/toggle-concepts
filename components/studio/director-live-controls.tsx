'use client';
import {Select} from '@/components/ui/select';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
export function DirectorLiveControls({directionId,busy,command,notes=true}:{directionId:string;busy:boolean;notes?:boolean;command:(body:Record<string,unknown>)=>Promise<boolean>}){
 const [text,setText]=useState(''),[recipient,setRecipient]=useState<'director'|'assembler'>('assembler');
 const control=(control:'wrap-up'|'stop'|'note')=>command({action:'control',directionId,control,requestId:crypto.randomUUID(),...(control==='note'?{recipient,text}:{})});
 return <div><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><Button disabled={busy} variant="outline" onClick={()=>void control('wrap-up')}>Finish with saved work · free</Button><Button disabled={busy} variant="outline" onClick={()=>void control('stop')}>Stop direction</Button></div>
 {notes&&<form onSubmit={e=>{e.preventDefault();void control('note').then(ok=>{if(ok)setText('');});}}><label>Notes for <Select value={recipient} onChange={e=>setRecipient(e.target.value as typeof recipient)}><option value="assembler">The coder</option><option value="director">The director</option></Select></label><textarea value={text} maxLength={4000} onChange={e=>setText(e.target.value)} aria-label="Notes for the running direction"/><Button type="submit" disabled={busy||!text.trim()}>Send notes within this allowance</Button></form>}</div>;
}
