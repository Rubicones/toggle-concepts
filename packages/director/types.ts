/** App-owned identity and approved facts; no creative layout vocabulary. */
export type Format = {id:string;width:number;height:number;fps:number;safe:{top:number;right:number;bottom:number;left:number};minTextPx:number};
export type Variant = {id:string;format:string;locale:string;hook:string;cta:string;length:number};
export type Scene = {id:string;sourceSceneId?:string;start:number;end:number;copy:string[];visualNotes:string;motionNotes:string;maxStaticSeconds:number};
export type BrandKit = {
 tokens:Record<string,string|number>;fonts:{family:string;url:string;weight?:string;style?:string}[];
 logos:{id:string;url:string;clearSpacePx:number;required?:boolean}[];
 rules:{allowedFonts:string[];forbiddenColours:string[];minimumContrast:number;logoRequired?:boolean};
 rawKit?:unknown;copy:Record<string,Record<string,string>>;facts:Record<string,string>;references:{id:string;url:string}[];
};
export type CompositionProps = {format:string;locale:string;hook:string;cta:string;length:number};
export type FrameProps = CompositionProps & {width?:number;height?:number;sceneId:string;moment:string};
export type Resource = {id:string;kind:'still'|'3d-still';proxy?:boolean;proxyFor?:'video'|'3d';resolution?:'low';purpose:string;scene:string;prompt:string;aspect:string;referenceAssetIds:string[];mustNotContain:string[]};
export type CatalogEntry = {id:string;url:string;thumbnail:string;width:number;height:number;sha256:string;mime:string;revisionId:string;renderSha256?:string;proxy?:boolean;proxyFor?:'video'|'3d'};
export type DirectionInput = {protocol:'director@1';stage?:'draft'|'motion';creativeHandoff?:import('./creative-handoff').CreativeHandoff;materialMemory?:import('./material-memory').MaterialMemory;runId:string;roundId:string;directionId:string;iterationId:string;storyboard:Scene[];brand:BrandKit;brief:Record<string,unknown>;assets:CatalogEntry[];formats:Format[];variants:Variant[];resourceIds:string[];variantFacts?:Record<string,{required:string[];sceneCopy:Record<string,string[]>;storyboard?:Scene[]}>};
export type TextBox = {text:string;x:number;y:number;width:number;height:number;fontSize:number;fontFamily:string;color:string;opacity:number};
export type LogoBox = {id:string;x:number;y:number;width:number;height:number};
export type FrameEvidence = {frame:number;width:number;height:number;text:TextBox[];logos:LogoBox[]};
export type Finding = {check:'copy'|'safe-area'|'legibility'|'brand'|'timing'|'motion'|'determinism'|'sandbox';message:string;frame?:number};
export type CheckReport = {passed:boolean;findings:Finding[];sampledFrames:number[];durationFrames:number;renderMs:number};
