import type {CatalogModel} from '../agents/catalog';
import type {TextSnapshot} from '../agents/text-provider';
/** A reasoning parameter alone never proves that disabling it is allowed. */
export function staticCoderReasoning(model:Pick<CatalogModel,'reasoning'>|undefined):Pick<TextSnapshot,'reasoningEffort'>{
 const supported=model?.reasoning?.supported_efforts;
 if(supported===null)return {reasoningEffort:'low'};
 for(const effort of ['low','minimal','medium','high','xhigh','max'] as const)if(supported?.includes(effort))return {reasoningEffort:effort};
 return {};
}
