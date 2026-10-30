import {cacheWriteRate} from './cache-usage';
import type {TextSnapshot} from './text-provider';
/** Same conservative byte-to-token bound used for admission; this is not a bill. */
export function textRequestQuote(prompt:string,cfg:TextSnapshot,transportTask='',visionCount=0){
 const inputTokenBound=Buffer.byteLength(cfg.instructions+(cfg.protocolInstructions??'')+prompt+transportTask+JSON.stringify(cfg.campaignContext??null)+JSON.stringify(cfg.upstream??[])+JSON.stringify(cfg.responseSchema??null),'utf8')+2048+visionCount*4224;
 const reservationMicroUsd=Math.max(1,Math.ceil((inputTokenBound*cacheWriteRate(cfg.pricing,cfg.cachePrompt)+cfg.maxOutputTokens*cfg.pricing.outputPrice)*1000000*1.1));
 if(!Number.isSafeInteger(reservationMicroUsd)||cfg.pricing.inputPrice<0||cfg.pricing.outputPrice<0)throw new Error('MODEL_PRICE_UNAVAILABLE');
 return {inputTokenBound,reservationMicroUsd};
}
export function retryOutputLimit(protocol:string|undefined,saved:number,agent:number,model:number){return protocol?.startsWith('preview-selection-')?Math.min(saved,agent,model):Math.min(agent,model);}
export function requireRequestAllowance(reservation:number,ceiling:number|null){if(ceiling!==null&&reservation>ceiling)throw new Error('PREVIEW_ESTIMATE_CHANGED');}
