/** App-owned identity and approved facts; no creative layout vocabulary. */
export type Format = {id:string;width:number;height:number;fps:number;safe:{top:number;right:number;bottom:number;left:number};minTextPx:number};
export type Variant = {id:string;format:string;locale:string;hook:string;cta:string;length:number};
export type Scene = {id:string;sourceSceneId?:string;start:number;end:number;copy:string[];visualNotes:string;motionNotes:string;maxStaticSeconds:number};
export type BrandKit = {
 tokens:Record<string,string|number>;fonts:{family:string;url:string;weight?:string;style?:string}[];
 logos:{id:string;url:string;clearSpacePx:number;required?:boolean;/** Same drawing with currentColor resolved: for dark and for light grounds. */variants?:{onDark:string;onLight:string}}[];
 rules:{allowedFonts:string[];forbiddenColours:string[];minimumContrast:number;logoRequired?:boolean};
 rawKit?:unknown;copy:Record<string,Record<string,string>>;facts:Record<string,string>;references:{id:string;url:string}[];
 /** The product's UI kit parts and screenshots: evidence for interface mockups built in code, never image references. */
 interface?:{id:string;url:string;role:'uikit'|'screenshot'}[];
 /** Brand sheet pages for the live critic (blocks with brief.brandSheetVersion 1): pinned files, sent as cached images. */
 sheet?:{section:string;slice:number;url:string;sha256:string;width:number;height:number}[];
};
export type CompositionProps = {format:string;locale:string;hook:string;cta:string;length:number};
export type FrameProps = CompositionProps & {width?:number;height?:number;sceneId:string;moment:string};
export type DerivedSource={revisionId:string;sha256:string;url:string;width:number;height:number};
export type Resource = {id:string;kind:'still'|'3d-still';proxy?:boolean;proxyFor?:'video'|'3d';resolution?:'low';purpose:string;scene:string;prompt:string;aspect:string;referenceAssetIds:string[];mustNotContain:string[];
 /** Image methods; `source`/`sha256` fields are pinned by the application before the request, never by the model. */
 sketch?:{shapes:{role:'subject'|'object'|'horizon'|'copy'|'light';box:number[];tone:'light'|'mid'|'dark'}[];sha256?:string};
 edit?:{from:string;instruction:string;region?:number[];source?:DerivedSource};
 extend?:{from:string;place?:number[];instruction?:string;source?:DerivedSource;canvasSha256?:string}};
export type CatalogEntry = {id:string;url:string;thumbnail:string;width:number;height:number;sha256:string;mime:string;revisionId:string;renderSha256?:string;proxy?:boolean;proxyFor?:'video'|'3d';image?:import('./image-facts').ImageFacts};
export type DirectionInput = {protocol:'director@1';stage?:'draft'|'motion';creativeHandoff?:import('./creative-handoff').CreativeHandoff;materialMemory?:import('./material-memory').MaterialMemory;runId:string;roundId:string;directionId:string;iterationId:string;storyboard:Scene[];brand:BrandKit;brief:Record<string,unknown>;assets:CatalogEntry[];formats:Format[];variants:Variant[];resourceIds:string[];variantFacts?:Record<string,{required:string[];sceneCopy:Record<string,string[]>;storyboard?:Scene[]}>};
export type TextBox = {text:string;x:number;y:number;width:number;height:number;fontSize:number;fontFamily:string;color:string;opacity:number};
export type LogoBox = {id:string;x:number;y:number;width:number;height:number};
export type FrameEvidence = {frame:number;width:number;height:number;text:TextBox[];logos:LogoBox[]};
export type Finding = {check:'copy'|'safe-area'|'legibility'|'brand'|'timing'|'motion'|'determinism'|'sandbox';message:string;frame?:number};
export type CheckReport = {passed:boolean;findings:Finding[];sampledFrames:number[];durationFrames:number;renderMs:number};
