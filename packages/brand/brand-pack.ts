// Chat-shaped plan C2: the brand pack, one compact brand every agent reads from the run context instead of the raw
// accepted revision (sorted JSON with provenance, links and every source excerpt). Deterministic plain labelled text:
// the brand's own direction and limits, and its accepted rules as "category.key: value" (the same keys the draft code
// reads from brand.tokens). No ids, hashes, links, provenance or source excerpts.
export const BRAND_PACK_VERSION='brand-pack@1';

const MAX={instructions:4000,boundaries:1500,rule:400};
type Rule={category?:unknown;key?:unknown;value?:unknown;decision?:unknown};
const clip=(text:string,max:number)=>{const t=text.replace(/\s+\n/g,'\n').trim();return t.length>max?`${t.slice(0,max).replace(/\s+\S*$/,'')} …`:t;};
const oneLine=(text:string,max:number)=>clip(text.replace(/\s+/g,' '),max);

/** The brand pack text from an accepted brand revision (its canonical text or parsed payload); null without a kit. */
export function brandPackText(revision:unknown):string|null{
 let v=revision;if(typeof v==='string'){try{v=JSON.parse(v);}catch{return null;}}
 const p=v as {kit?:Record<string,unknown>;payload?:{kit?:Record<string,unknown>}}&Record<string,unknown>|null;
 const kit=(p?.kit??p?.payload?.kit??(Array.isArray(p?.rules)?p:null)) as {instructions?:unknown;boundaries?:unknown;rules?:unknown}|null;
 if(!kit)return null;
 const rules=(Array.isArray(kit.rules)?kit.rules as Rule[]:[]).filter(r=>r&&typeof r.category==='string'&&typeof r.key==='string'&&typeof r.value==='string'&&String(r.value).trim()&&(r.decision===undefined||r.decision==='accepted'));
 const lines=[...new Map(rules.map(r=>[`${r.category}.${r.key}`,oneLine(String(r.value),MAX.rule)])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`- ${k}: ${v}`);
 const parts=[
  typeof kit.instructions==='string'&&kit.instructions.trim()?`DIRECTION (the brand's own words)\n${clip(kit.instructions,MAX.instructions)}`:'',
  typeof kit.boundaries==='string'&&kit.boundaries.trim()?`FREEDOM AND LIMITS\n${clip(kit.boundaries,MAX.boundaries)}`:'',
  lines.length?`ACCEPTED RULES (the draft code reads the same keys from brand.tokens)\n${lines.join('\n')}`:'',
 ].filter(Boolean);
 return parts.length?parts.join('\n\n'):null;
}

const IN_PREFIX='The brand is in the run context (BRAND PACK); it is not repeated here.';
/**
 * A request's campaign context without the brand copies the brand pack replaces: planning roles' accepted kit and the
 * designer's brand fields (raw kit, summary, tokens). The designer keeps the logo ids and font families its code uses.
 * Only for runs whose run context holds a brand pack; the frozen campaign context itself is never changed.
 */
export function withoutBrandDuplicates(context:unknown):unknown{
 if(!context||typeof context!=='object'||Array.isArray(context))return context;
 const c={...(context as Record<string,unknown>)};
 if('acceptedBrandKit' in c)c.acceptedBrandKit=IN_PREFIX;
 const input=c.input as Record<string,unknown>|undefined;
 if(input&&typeof input==='object'&&input.brand&&typeof input.brand==='object'){
  const b=input.brand as {logos?:{id?:unknown}[];fonts?:{family?:unknown;weight?:unknown;style?:unknown}[]};
  c.input={...input,brand:{note:IN_PREFIX,...(Array.isArray(b.logos)?{logos:b.logos.map(l=>({id:l?.id}))}:{}),...(Array.isArray(b.fonts)?{fonts:b.fonts.map(f=>({family:f?.family,...(f?.weight!==undefined?{weight:f.weight}:{}),...(f?.style!==undefined?{style:f.style}:{})}))}:{})}};
 }
 return c;
}
