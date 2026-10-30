import React from "react";
import { Composition, registerRoot } from "remotion";
import { sampleScene } from "../fixtures/scene";
import { LocalComposition } from "./LocalComposition";
import { ThreeProbe } from "./ThreeProbe";

function Root() {
  return <>
    <Composition id="M00Local" component={LocalComposition} defaultProps={{ scene: sampleScene }}
      width={640} height={360} fps={30} durationInFrames={180} />
    <Composition id="M00ThreeProbe" component={ThreeProbe} width={320} height={320} fps={30} durationInFrames={60} />
  </>;
}
registerRoot(Root);
