// Chat-shaped plan C7 follow-up (C0 finding 6d): one cached prefix for every role of a shared run. With --json-schema
// the CLI adds a StructuredOutput tool built from the role's own schema, and the tools block comes before the system
// prompt in the cache order, so no role (and no branched planning stage) could read another's cache. In run contexts
// frozen from now on, the planning roles send no --json-schema: their answer format travels as text after the shared
// prefix, and the app checks the answer against the same JSON schema the CLI used to enforce (types, enums, required
// fields, no other fields, list sizes), with one repair turn in the same conversation, as the CLI's own check did.
// Nothing that schema rejects reaches the workflow; the workflow's own validation still runs after it. Pure.

export const SCHEMA_IN_TEXT_VERSION='schema-in-text@1';
/** The planning roles of the workflow. The designer (its versions keep their exact requests), the critic and the brand
 * character request keep --json-schema. */
export const TEXT_SCHEMA_ROLES:ReadonlySet<string>=new Set(['research','strategy','variants','script','localization','visual-direction']);
export const usesSchemaInText=(ctx:{schemaInText?:string}|null|undefined,role?:string)=>!!ctx?.schemaInText&&!!role&&TEXT_SCHEMA_ROLES.has(role);

type Schema={type?:string|string[];enum?:unknown[];const?:unknown;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean|Schema;items?:Schema;minItems?:number;maxItems?:number;anyOf?:Schema[]};
const typeOf=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':Number.isInteger(v)?'integer':typeof v;
const fits=(v:unknown,t:string)=>t==='number'?typeof v==='number':typeOf(v)===t;
/**
 * Where a value breaks a JSON schema, as short lines ("deliverable.treatments.0.conceptId: not one of …"); empty when it
 * fits. The keywords the role schemas use: type, enum, const, properties, required, additionalProperties, items,
 * minItems, maxItems and anyOf.
 */
export function schemaIssues(value:unknown,schema:Schema,path='answer',out:string[]=[],limit=12):string[]{
 if(out.length>=limit)return out;
 if(schema.anyOf){if(!schema.anyOf.some(s=>!schemaIssues(value,s,path,[],1).length))out.push(`${path}: fits none of the allowed shapes`);return out;}
 const types=schema.type===undefined?[]:Array.isArray(schema.type)?schema.type:[schema.type];
 if(types.length&&!types.some(t=>fits(value,t))){out.push(`${path}: must be ${types.join(' or ')}`);return out;}
 if(schema.enum&&!schema.enum.some(e=>e===value)){out.push(`${path}: must be one of ${schema.enum.map(e=>JSON.stringify(e)).join(', ')}`);return out;}
 if(schema.const!==undefined&&schema.const!==value){out.push(`${path}: must be ${JSON.stringify(schema.const)}`);return out;}
 if(Array.isArray(value)){
  if(schema.minItems!==undefined&&value.length<schema.minItems)out.push(`${path}: at least ${schema.minItems} items`);
  if(schema.maxItems!==undefined&&value.length>schema.maxItems)out.push(`${path}: at most ${schema.maxItems} items`);
  if(schema.items)value.forEach((x,i)=>schemaIssues(x,schema.items!,`${path}.${i}`,out,limit));
  return out;
 }
 if(value&&typeof value==='object'){
  const o=value as Record<string,unknown>,props=schema.properties??{};
  for(const k of schema.required??[])if(!(k in o))out.push(`${path}.${k}: missing`);
  for(const [k,x] of Object.entries(o)){
   if(props[k])schemaIssues(x,props[k],`${path}.${k}`,out,limit);
   else if(schema.additionalProperties===false)out.push(`${path}.${k}: not a field of this answer`);
   else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')schemaIssues(x,schema.additionalProperties,`${path}.${k}`,out,limit);
  }
 }
 return out.slice(0,limit);
}

/** The brackets a JSON text leaves open at its end, and whether it ends inside a string. */
function openBrackets(t:string):{open:string[];inString:boolean;extra:number}{
 const open:string[]=[];let inString=false,escaped=false,extra=0;
 for(const c of t){
  if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue;}
  if(c==='"')inString=true;else if(c==='{'||c==='[')open.push(c);else if(c==='}'||c===']'){if(open.length)open.pop();else extra++;}
 }
 return {open,inString,extra};
}
/** What is wrong with a text that is not one JSON object, in words the model can act on. */
export function jsonProblem(text:string|null|undefined):string{
 const t=(text??'').trim();if(!t)return 'the answer is empty';
 const start=t.indexOf('{');if(start<0)return 'there is no JSON object in the answer';
 const b=openBrackets(t.slice(start));
 if(b.inString)return 'the JSON stops inside a text value: it was cut off';
 if(b.open.length)return `the JSON is not closed: ${b.open.length} closing bracket${b.open.length===1?'':'s'} missing at the end (${[...b.open].reverse().map(c=>c==='{'?'}':']').join(' ')})`;
 if(b.extra)return `the JSON has ${b.extra} closing bracket${b.extra===1?'':'s'} too many`;
 try{JSON.parse(t.slice(start,t.lastIndexOf('}')+1));return 'the answer is not one JSON object';}catch(error){return `the JSON does not parse: ${error instanceof Error?error.message.slice(0,160):'syntax error'}`;}
}
/** The JSON object of a text answer: the whole text, or the inside of one code fence around it, or the outermost
 * object when a line of prose surrounds it. One mechanical completion only (live run 2026-11-14: a 9,000-character
 * answer missed its last closing brace twice, and each time the whole 180k request was run again): a complete answer
 * whose only fault is closing brackets missing at its very end, or too many of them, is closed or trimmed. Nothing
 * inside the answer is repaired or guessed. */
export function readJsonAnswer(text:string|null|undefined):{value:unknown;completed?:true}|{error:'INCOMPLETE_JSON'}{
 const t=(text??'').trim(),fenced=/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(t)?.[1]?.trim();
 for(const candidate of [fenced??t,t.slice(t.indexOf('{'),t.lastIndexOf('}')+1)]){
  if(!candidate)continue;try{const value=JSON.parse(candidate);if(value&&typeof value==='object'&&!Array.isArray(value))return {value};}catch{/* next candidate */}
 }
 const body=(fenced??t).slice(Math.max(0,(fenced??t).indexOf('{'))),b=openBrackets(body);
 if(body.startsWith('{')&&!b.inString&&/[}\]"0-9el]$/.test(body)){
  let fixed=body;
  if(b.open.length&&!b.extra)fixed=body+[...b.open].reverse().map(c=>c==='{'?'}':']').join('');
  else if(b.extra&&!b.open.length){for(let n=b.extra;n>0&&/[}\]]$/.test(fixed);n--)fixed=fixed.slice(0,-1).trimEnd();}
  if(fixed!==body)try{const value=JSON.parse(fixed);if(value&&typeof value==='object'&&!Array.isArray(value))return {value,completed:true};}catch{/* not that simple */}
 }
 return {error:'INCOMPLETE_JSON'};
}

/** The answer format as the last part of the role's message (after the shared prefix). */
export const answerFormatText=(schema:Record<string,unknown>)=>`ANSWER FORMAT
Reply with one JSON object only: no words before or after it and no code fence. It must match this JSON schema exactly: every required field, no other fields, only the listed values.
${JSON.stringify(schema)}`;
/** The one repair message, in the same conversation, when an answer does not match its format. */
export const repairText=(issues:string[])=>`That answer does not match the answer format:\n${issues.map(i=>`- ${i}`).join('\n')}\nReply again with the whole corrected JSON object only, keeping everything else as it was.`;
/** After a round of materials: the answer itself, in the format given under "answer" above. */
export const MATERIALS_ANSWER_FORMAT='Reply with your answer itself: one JSON object matching the schema under "answer" in the answer format above, with no wrapper, words or code fence.';
