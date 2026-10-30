const axes=['conceptSlot','locale','hook','beatSequence','offer','durationSeconds','placementId'] as const;
/** Application-owned identity repair only: exact ordered axes, never fuzzy content matching. */
export function bindVariantIdentities(deliverable:Record<string,unknown>,manifest:{entries:Record<string,unknown>[]}){
 const rows=(deliverable.manifest as {entries?:unknown[]}|undefined)?.entries;
 if(!Array.isArray(rows)||!rows.length||rows.length!==manifest.entries.length||deliverable.orderedCount!==rows.length)throw new Error('MANIFEST_COVERAGE_MISMATCH');
 const known=new Set(manifest.entries.map(e=>e.id)),seen=new Set<string>();let changed=false;
 const entries=rows.map((row,i)=>{
  const expected=manifest.entries[i];
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('MANIFEST_BINDING_MISMATCH');
  const got=row as Record<string,unknown>,key=JSON.stringify(axes.map(k=>expected[k]));
  if(seen.has(key)||axes.some(k=>expected[k]===undefined||got[k]!==expected[k])||typeof expected.id!=='string')throw new Error('MANIFEST_BINDING_MISMATCH');
  seen.add(key);
  if(got.id===expected.id)return got;
  // A real ID belonging to another ordered binding is a conflict, not a spelling error.
  if(got.id!==undefined&&(typeof got.id!=='string'||known.has(got.id)))throw new Error('MANIFEST_BINDING_MISMATCH');
  changed=true;return {...got,id:expected.id};
 });
 return {changed,deliverable:{...deliverable,manifest:{...(deliverable.manifest as Record<string,unknown>),entries}}};
}

/** The model audits scope; it need not copy the application's already-frozen order. */
export function expandProvidedManifest(deliverable:Record<string,unknown>,manifest:{entries:Record<string,unknown>[]}){
 const value=deliverable.manifest as Record<string,unknown>|undefined;
 if(!value||value.useProvided!==true)return {changed:false,deliverable};
 if(value.entries!==undefined||deliverable.orderedCount!==undefined&&deliverable.orderedCount!==manifest.entries.length)throw new Error('MANIFEST_BINDING_MISMATCH');
 const {useProvided:consumed,...metadata}=value;void consumed;
 return {changed:true,deliverable:{...deliverable,orderedCount:manifest.entries.length,manifest:{...metadata,entries:structuredClone(manifest.entries)}}};
}
export const variantAuditTask='Audit the application-provided VariantManifest. It is already stored with exact IDs and order. Do not reproduce its rows or UUIDs. Return deliverable.manifest={"useProvided":true}, omit orderedCount (the application computes it), and give concise coverage, duplicate, invalid-row and proposed-amendment findings. Scope changes remain proposals. The application binds the unchanged provided rows; you do not enumerate or redesign them.';
