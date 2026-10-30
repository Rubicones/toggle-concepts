"use client";

import { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { previewScene } from "../../fixtures/preview-scene";
import { LocalComposition } from "../../remotion/LocalComposition";
import { ThreeProbe } from "../../remotion/ThreeProbe";
import "./preview.css";

export default function Preview() {
  const player = useRef<PlayerRef>(null);
  const [show3d, setShow3d] = useState(false);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const current = player.current;
    const onFrame = (event: { detail: { frame: number } }) => setFrame(event.detail.frame);
    current?.addEventListener("frameupdate", onFrame);
    return () => { current?.removeEventListener("frameupdate", onFrame); };
  }, []);

  return <div className="m00-preview">
    <div data-testid="main-player">
      <Player ref={player} component={LocalComposition} inputProps={{ scene: previewScene }}
        compositionWidth={640} compositionHeight={360} durationInFrames={180} fps={30}
        controls loop initiallyMuted style={{ width: "100%" }} />
    </div>
    <p>640 × 360 · 30 fps · 6 seconds. Enable sound in the player to hear the quiet test tone.</p>
    <div className="m00-actions">
      <button onClick={() => { player.current?.pause(); player.current?.seekTo(0); }}>Frame 0</button>
      <button onClick={() => { player.current?.pause(); player.current?.seekTo(60); }}>Frame 60</button>
      <span data-testid="current-frame">Frame: {frame}</span>
    </div>
    <p>The standalone local runner is the selected rendering path. Browser export is a separate experiment.</p>
    <p><a href="/preview/browser-export" target="_blank" rel="noopener noreferrer">Open browser export experiment</a></p>
    <button aria-expanded={show3d} onClick={() => setShow3d(!show3d)}>Separate 3D probe</button>
    {show3d && <div data-testid="three-player" className="m00-three">
      <Player component={ThreeProbe} compositionWidth={320} compositionHeight={320} durationInFrames={60} fps={30}
        controls loop style={{ width: 320, maxWidth: "100%" }} />
      <p>A lit cube tests WebGL support. Imported models and 3D generation providers remain unverified.</p>
    </div>}
  </div>;
}
