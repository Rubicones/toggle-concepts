import type {LiveAsset,LivePreview} from './live-preview';
export const LIVE_ASSET_BYTES=10485760,LIVE_ASSET_TOTAL_BYTES=33554432;
export type CachedLiveAsset={data:string;bytes:number};
/** Replace data in place: imported resource objects keep their identity, removed bindings disappear. */
export function replaceLiveRecord<T>(target:Record<string,T>,next:Record<string,T>){for(const key of Object.keys(target))if(!Object.hasOwn(next,key))delete target[key];Object.assign(target,next);}
export function availableLiveResources(resources:LivePreview['resources'],assets:Record<string,string>):NonNullable<LivePreview['resources']>{
 return Object.fromEntries(Object.entries(resources??{}).map(([id,r])=>[id,r.ready&&assets[r.url]?r:{...r,url:'',ready:false}]));
}
/** Independent arrivals, bounded data/cache, no all-assets barrier and no failed read cached as success. */
export async function loadLiveAssets(args:{files:LiveAsset[];cache:Map<string,CachedLiveAsset>;read:(file:LiveAsset)=>Promise<CachedLiveAsset>;onChange?:(assets:Record<string,string>)=>void}){
 const assets:Record<string,string>={},wanted=new Set(args.files.map(f=>f.sha256));
 for(const hash of args.cache.keys())if(!wanted.has(hash))args.cache.delete(hash);
 let total=0;for(const [hash,value]of args.cache){if(value.bytes>LIVE_ASSET_BYTES||value.bytes<1||total+value.bytes>LIVE_ASSET_TOTAL_BYTES)args.cache.delete(hash);else total+=value.bytes;}
 for(const file of args.files){const saved=args.cache.get(file.sha256);if(saved)assets[file.name]=saved.data;}args.onChange?.({...assets});
 const reads=new Map<string,Promise<CachedLiveAsset>>();let index=0;
 await Promise.all(Array.from({length:Math.min(4,args.files.length)},async()=>{while(index<args.files.length){const file=args.files[index++];try{
  let value=args.cache.get(file.sha256);
  if(!value){let pending=reads.get(file.sha256);if(!pending){pending=args.read(file).then(value=>{if(!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>LIVE_ASSET_BYTES||total+value.bytes>LIVE_ASSET_TOTAL_BYTES)throw new Error('LIVE_ASSET_SIZE_LIMIT');total+=value.bytes;args.cache.set(file.sha256,value);return value;});reads.set(file.sha256,pending);}value=await pending;}
  assets[file.name]=value.data;args.onChange?.({...assets});
 }catch{/* A missing picture stays pending; later updates can retry it. */}}}));
 return {assets,missing:args.files.filter(file=>!assets[file.name]).map(file=>file.name)};
}
