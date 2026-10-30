// Standalone renderer entry. Requires explicit compiled input; no sample campaign defaults.
import React from "react";
import {Composition,registerRoot} from "remotion";
import {DraftComposition} from "./DraftComposition";
import type {DraftProgram} from "../packages/contracts/drafts";
type Input={program:DraftProgram|null;assetUrls:Record<string,string>};
function RequiredDraft({program,assetUrls}:Input){if(!program)throw new Error("COMPILED_DRAFT_REQUIRED");return <DraftComposition program={program} assetUrls={assetUrls}/>;}
function Root(){return <Composition id="M07Draft" component={RequiredDraft} defaultProps={{program:null,assetUrls:{}}} width={640} height={360} fps={30} durationInFrames={30} calculateMetadata={({props})=>{if(!props.program)throw new Error("COMPILED_DRAFT_REQUIRED");return {width:props.program.width,height:props.program.height,fps:props.program.fps,durationInFrames:props.program.durationFrames};}}/>;}
registerRoot(Root);
