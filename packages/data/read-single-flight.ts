// Share only concurrent reads. No TTL cache, writes, receipts or authentication
// decisions live here. Callers must authorize first and scope keys to the actor.
const pending=new Map<string,Promise<unknown>>();
export function singleFlightRead<T>(key:string,read:()=>Promise<T>):Promise<T>{
 const existing=pending.get(key);if(existing)return existing as Promise<T>;
 const request=Promise.resolve().then(read).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
 pending.set(key,request);return request;
}
