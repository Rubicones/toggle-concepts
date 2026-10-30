import type {ProviderErrorDetail} from "./provider-error";
export type SharedCampaign={id:string;name:string;brand:string;goal:string;document:Record<string,string>;version:number;created_at:string};
export type AgentSetting={role:string;model_id:string|null;instructions:string;updated_at?:string;max_output_tokens:number;step_cap_micro_usd:number};
export type SharedRun={id:string;campaign_id:string;name:string;status:string;closure_reason?:string|null;cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number;config_snapshot:AgentSetting[];created_at:string};
export type AgentStep={id:string;campaign_id:string;run_id:string;role:string;model_id:string;prompt:string;status:string;output:string|null;cost_micro_usd:number|null;reserve_micro_usd:number;usage?:{_studio?:{providerError?:ProviderErrorDetail;finishReason?:string|null;maxOutputTokens?:number}}|null;error_code:string|null;created_at:string};
export type AgentStepSummary=Omit<AgentStep,'prompt'|'output'|'usage'>;
export type CampaignDetail={campaign:SharedCampaign;runs:SharedRun[];steps:AgentStepSummary[];events:{id:string;event_type:string;created_at:string}[];next?:number|null};
export type ModelOption={id:string;name:string;inputPrice:number;outputPrice:number;contextLength:number;maxOutput:number;outputModalities:string[];supportedParameters:string[]};
export const money=(micro:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4}).format(micro/1000000);
