/** New creative admission is director@1. Legacy blocks remain readable. */
import 'server-only';
import {directorStart,directorTick} from './director-start';
import {ApiError} from './api';
import {checked} from './studio';
import type {draftContext} from './drafts';
export async function creativeBlock(saved:Awaited<ReturnType<typeof draftContext>>){return checked(await saved.admin.from('studio_creative_blocks').select('*').eq('round_id',saved.round.id).eq('tenant_id',saved.tenant).maybeSingle());}
export const creativeStart=directorStart;
export const creativeTick=directorTick;
export async function creativeDecision(_campaignId:string,_input:unknown):Promise<never>{void _campaignId;void _input;throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical drafts are read-only. Use Draft versions to review a new director draft price.');}
export async function quoteCreativeBuildRepair(_campaignId:string,_direction:number):Promise<never>{void _campaignId;void _direction;throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical layout repairs are retired. Use notes in Draft versions to prepare a priced revision.');}
