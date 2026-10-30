/** Flexible evidence at agent boundaries; canonical identities remain application-owned. */
export type KnowledgePassage={path:string;text:string};
export function readKnowledge(value:unknown){
 const passages:KnowledgePassage[]=[];let visited=0,limited=false;
 const visit=(node:unknown,path:string,depth:number)=>{
  if(++visited>4096||depth>24){limited=true;return;}
  if(typeof node==='string'){if(node.trim())passages.push({path,text:node});return;}
  if(typeof node==='number'||typeof node==='boolean'){passages.push({path,text:String(node)});return;}
  if(Array.isArray(node)){for(let index=0;index<node.length;index++){if(visited>=4096){limited=true;break;}visit(node[index],`${path}/${index}`,depth+1);}return;}
  if(node&&typeof node==='object')for(const [key,item]of Object.entries(node)){if(visited>=4096){limited=true;break;}visit(item,`${path}/${key.replace(/~/g,'~0').replace(/\//g,'~1')}`,depth+1);}
 };
 // JSON is accepted, but ordinary prose never has to pretend to be JSON.
 let content=value;if(typeof value==='string')try{content=JSON.parse(value);}catch{/* prose */}
 visit(content,'',0);return {raw:value,content,passages,limited};
}

export type ReferenceEntity={id:string;aliases:readonly string[]};
export type ReferenceResolution={status:'resolved';id:string}|{status:'missing'|'ambiguous';candidates:string[]};
const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
/** No fuzzy matching, foreign lookup, new IDs or "first match" fallback. */
export function resolveReference(value:unknown,entities:readonly ReferenceEntity[]):ReferenceResolution{
 const keys=readKnowledge(value).passages.map(p=>p.text),exact=new Set(keys.flatMap(key=>entities.filter(e=>e.id===key||/^[a-f0-9]{64}$/i.test(key)&&e.aliases.some(alias=>normalized(alias)===normalized(key))).map(e=>e.id)));
 if(exact.size)return exact.size===1?{status:'resolved',id:[...exact][0]}:{status:'ambiguous',candidates:[...exact].sort()};
 const matches=new Set(keys.flatMap(key=>entities.filter(e=>e.aliases.some(alias=>normalized(alias)===normalized(key))).map(e=>e.id)));
 return matches.size===1?{status:'resolved',id:[...matches][0]}:{status:matches.size?'ambiguous':'missing',candidates:[...matches].sort()};
}
