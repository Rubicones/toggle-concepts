// A single serialized writer per editor. Never submits checkpoints or paid work.
export type SaveState<T>={value:T;version:number;dirty:boolean;saving:boolean;error:string|null};
export class DraftPersistence<T>{
 private state:SaveState<T>;
 private saved:string;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private flight:Promise<number>|null=null;
 private listeners=new Set<()=>void>();
 constructor(initial:T,version:number,private write:(value:T,version:number,previous:T)=>Promise<number>,private changed:()=>void=()=>{},private delay=500){this.state={value:initial,version,dirty:false,saving:false,error:null};this.saved=JSON.stringify(initial);}
 getSnapshot=()=>this.state;
 discard=()=>this.reset(JSON.parse(this.saved) as T,this.state.version);
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private emit(patch:Partial<SaveState<T>>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();this.changed();}
 set=(next:T|((value:T)=>T))=>{const value=typeof next==='function'?(next as (value:T)=>T)(this.state.value):next;const dirty=JSON.stringify(value)!==this.saved;this.emit({value,dirty,error:null});clearTimeout(this.timer);if(dirty)this.timer=setTimeout(()=>{void this.flush().catch(()=>{});},this.delay);};
 reset=(value:T,version:number)=>{if(this.state.saving)throw new Error('Wait for the current save before loading another revision.');clearTimeout(this.timer);this.saved=JSON.stringify(value);this.emit({value,version,dirty:false,error:null});};
 adopt=(value:T,version:number)=>{if(version>this.state.version&&!this.state.dirty&&!this.state.saving)this.reset(value,version);};
 flush=(ensure=false):Promise<number>=>{
  clearTimeout(this.timer);
  if(this.flight)return this.flight.then(()=>this.flush(ensure));
  if(!this.state.dirty&&(!ensure||this.state.version>0))return Promise.resolve(this.state.version);
  this.emit({saving:true,error:null});
  this.flight=(async()=>{try{do{const value=this.state.value,serialized=JSON.stringify(value);const version=await Promise.resolve().then(()=>this.write(value,this.state.version,JSON.parse(this.saved) as T));this.saved=serialized;this.emit({version,dirty:JSON.stringify(this.state.value)!==this.saved});}while(this.state.dirty);return this.state.version;}catch(error){this.emit({error:error instanceof Error?error.message:'Could not save to Supabase.',dirty:true});throw error;}finally{this.flight=null;this.emit({saving:false});}})();
  return this.flight;
 };
}
