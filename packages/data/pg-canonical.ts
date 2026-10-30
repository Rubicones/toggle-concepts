/**
 * The exact text app_private.review_canonical(jsonb) produces, computed from the jsonb text Postgres returns
 * (`column::text`). Number literals are kept as Postgres printed them: a JS round-trip would rewrite
 * numeric values such as 0.33333333333333333333 or 0.00000000000000005551 and break hash fences.
 */
export function pgReviewCanonical(jsonText:string):string{
 let i=0;const s=jsonText;
 const ws=()=>{while(i<s.length&&/\s/.test(s[i]))i++;};
 const str=():string=>{const start=i;i++;while(s[i]!=='"'){if(s[i]==='\\')i++;i++;}i++;return JSON.parse(s.slice(start,i)) as string;};
 const value=():string=>{
  ws();const c=s[i];
  if(c==='{'){i++;const entries:[string,string][]=[];ws();if(s[i]==='}'){i++;return '{}';}
   for(;;){ws();const key=str();ws();i++;/* : */entries.push([key,value()]);ws();if(s[i]===','){i++;continue;}i++;break;}
   entries.sort((a,b)=>Buffer.compare(Buffer.from(a[0]),Buffer.from(b[0])));
   return `{${entries.map(([k,v])=>`${JSON.stringify(k)}:${v}`).join(',')}}`;}
  if(c==='['){i++;const items:string[]=[];ws();if(s[i]===']'){i++;return '[]';}
   for(;;){items.push(value());ws();if(s[i]===','){i++;continue;}i++;break;}
   return `[${items.join(',')}]`;}
  if(c==='"')return JSON.stringify(str());
  const start=i;while(i<s.length&&!/[\s,\]}]/.test(s[i]))i++;return s.slice(start,i);
 };
 const out=value();ws();if(i!==s.length)throw new Error('PG_CANONICAL_TRAILING_TEXT');return out;
}
