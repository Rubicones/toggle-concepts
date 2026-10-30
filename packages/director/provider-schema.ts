/**
 * Structured-output dialects differ by provider: Anthropic rejects (HTTP 400) oneOf, string/number bounds,
 * maxItems/minItems > 1, pattern and format. The provider gets the portable core; the app still validates every
 * reply with the full zod contract afterwards, so no rule is lost.
 */
const dropped=new Set(['$schema','minLength','maxLength','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','maxItems','pattern','format','minProperties','maxProperties','uniqueItems']);
export function providerJsonSchema(schema:unknown):unknown{
 if(Array.isArray(schema))return schema.map(providerJsonSchema);
 if(!schema||typeof schema!=='object')return schema;
 const out:Record<string,unknown>={};
 for(const [key,value]of Object.entries(schema as Record<string,unknown>)){
  if(dropped.has(key))continue;
  if(key==='minItems'){if(typeof value==='number'&&value<=1)out.minItems=value;continue;}
  if(key==='oneOf'){out.anyOf=providerJsonSchema(value);continue;}
  if(key==='const'){out.enum=[value];continue;}
  out[key]=providerJsonSchema(value);
 }
 return out;
}
