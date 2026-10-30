"use client";
import {Button} from '@/components/ui/button';
export function SaveStatus({dirty,saving,error,version,retry}:{dirty:boolean;saving:boolean;error:string|null;version:number;retry:()=>Promise<unknown>}){return <div className="draft-save-status" role="status" aria-live="polite">{error?<><span>Not saved: {error}</span><Button type="button" variant="outline" onClick={()=>{void retry().catch(()=>{});}}>Retry save</Button></>:saving?'Saving to Supabase…':dirty?'Changes waiting to save…':version?'Saved to Supabase':'Edits save automatically to Supabase.'}</div>;}
