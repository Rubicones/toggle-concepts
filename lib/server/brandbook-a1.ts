import 'server-only';
import {ApiError} from './api';
import {checked, studioContext} from './studio';
import {schemaMissing} from './brief';
import type {BrandDraft} from '@/packages/contracts/brand-kit';
import type {BrandbookHeader, BrandbookItem} from '@/packages/brand/a1-handoff';

export async function submittedBrandbook(campaignId:string,id?:string){
 const {admin,tenant}=await studioContext();
 if(!id){const head=await admin.from('studio_brandbook_heads').select('submission_id').eq('campaign_id',campaignId).maybeSingle();if(head.error&&schemaMissing(head.error))return null;id=checked(head)?.submission_id;if(!id)return null;}
 const book=checked(await admin.from('studio_brandbook_submissions').select('id,version_no,sha256,summary').eq('id',id).eq('tenant_id',tenant).eq('campaign_id',campaignId).maybeSingle());
 if(!book)throw new ApiError(409,'BRANDBOOK_NOT_FOUND','The submitted brandbook does not belong to this campaign.');
 return book as BrandbookHeader;
}
export async function submittedBrandbookItems(campaignId:string,book:BrandbookHeader){
 // Confirm scope even when callers have a previously loaded header.
 await submittedBrandbook(campaignId,book.id);
 const {admin}=await studioContext(),items:BrandbookItem[]=[];
 for(let offset=0;;offset+=1000){const rows=checked(await admin.from('studio_brandbook_submission_items').select('payload').eq('submission_id',book.id).order('source_seq').range(offset,offset+999))??[];items.push(...rows.map(row=>row.payload as BrandbookItem));if(rows.length<1000)break;}
 return items;
}
/** Scope/hash/finding membership is verified before save, import or publishing. */
export async function validateBrandbookReferences(campaignId:string,draft:BrandDraft){
 const books=new Map<string,BrandbookItem[]>(),refs=draft.brandbookImports??[];
 if(new Set(refs.map(r=>r.submissionId)).size!==refs.length)throw new ApiError(409,'INVALID_BRANDBOOK_REFERENCE','Duplicate submitted brandbook references.');
 for(const ref of refs){const book=await submittedBrandbook(campaignId,ref.submissionId);if(!book||book.sha256!==ref.sha256||book.version_no!==ref.versionNo)throw new ApiError(409,'INVALID_BRANDBOOK_REFERENCE','The source brandbook version or hash does not match this campaign.');const items=await submittedBrandbookItems(campaignId,book);if(items.length!==ref.findingCount)throw new ApiError(409,'INVALID_BRANDBOOK_REFERENCE','The source brandbook finding count changed.');books.set(book.id,items);}
 for(const rule of draft.rules){const ref=rule.brandbookSource;if(!ref)continue;const items=books.get(ref.submissionId);if(!items||ref.findingIds.some(id=>!items.some(item=>item.findingId===id))||rule.provenance.kind==='material'&&!ref.findingIds.some(id=>items.some(item=>item.findingId===id&&item.materialId===rule.provenance.sourceId)))throw new ApiError(409,'INVALID_BRANDBOOK_REFERENCE','A working rule cites findings outside its imported source book.');}
 return books;
}
