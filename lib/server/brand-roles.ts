import 'server-only';
import {studioContext} from './studio';
import {effectiveMaterialRole} from '@/packages/brand/material-roles';
import {brandScope} from './brand-source';
/** Every ready file of this brand with its role: the AD's choice when made, otherwise the application's guess. */
export async function materialRoleRows(campaignId:string){
 const {admin,tenant}=await studioContext();
 const base='id,filename,relative_path,mime,kind:extraction->>kind,metadata:extraction->metadata';
 let rows=await admin.from('studio_brand_materials').select(`${base},role`).eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('state','ready').order('relative_path').limit(500);
 if(rows.error)rows=await admin.from('studio_brand_materials').select(base).eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('state','ready').order('relative_path').limit(500) as typeof rows;
 if(rows.error)return [];
 return (rows.data??[]).map(r=>{const row=r as unknown as {id:string;filename:string;relative_path:string;mime:string;kind:string|null;metadata:Record<string,unknown>|null;role?:string|null};const role=effectiveMaterialRole({filename:row.filename,relative_path:row.relative_path,mime:row.mime,extraction:{kind:row.kind??undefined,metadata:row.metadata??undefined},role:row.role});return {id:row.id,filename:row.filename,path:row.relative_path,mime:row.mime,...role};});
}
/** Material id → confirmed role (the AD's choice or a sure guess) for this campaign's brand; unsure files have none. */
export async function brandRoleOf(campaignId:string){const rows=await materialRoleRows(await brandScope(campaignId));const map=new Map(rows.filter(r=>r.sure).map(r=>[r.id,r.role]));return (id:string)=>map.get(id);}
