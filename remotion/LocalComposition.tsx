import React, { useEffect, useState } from "react";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, cancelRender, continueRender, delayRender, Img, interpolate,
  Sequence, staticFile, useCurrentFrame } from "remotion";
import { parseScene, type SceneSpec } from "../packages/contracts/scene";

export type LocalProps = { scene: SceneSpec };

function LocalFonts({ scene }: LocalProps) {
  const [handle] = useState(() => delayRender("Load packaged Latin/Cyrillic font"));
  useEffect(() => {
    let cancelled = false;
    const fonts = scene.fontAssetRevisionIds.map((revisionId) => {
      const asset = scene.assets.find((a) => a.revisionId === revisionId)!;
      return new FontFace("StudioNoto", `url("${staticFile(asset.objectKey)}")`, {
        weight: "400", unicodeRange: revisionId.includes("cyrillic")
          ? "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" : "U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC",
      });
    });
    Promise.all(fonts.map((font) => font.load())).then((loaded) => {
      if (cancelled) return;
      loaded.forEach((font) => document.fonts.add(font));
      continueRender(handle);
    }).catch((error) => { if (!cancelled) cancelRender(error); });
    return () => { cancelled = true; };
  }, [handle, scene]);
  return null;
}

// The same validated component is used by Player, web exporter, and local runner.
// Layer order is paint order; all motion derives from the requested frame.
export function LocalComposition({ scene: input }: LocalProps) {
  const [scene] = useState(() => parseScene(input));
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 18], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: "#202c28", fontFamily: "StudioNoto", fontWeight: 400 }}>
    <LocalFonts scene={scene} />
    {scene.layers.map((layer) => {
      const bounds = scene.slots.find((slot) => slot.id === layer.slotId)!.bounds;
      const style: React.CSSProperties = { position: "absolute", left: bounds.x * scene.width,
        top: bounds.y * scene.height, width: bounds.w * scene.width, height: bounds.h * scene.height };
      let content: React.ReactNode;
      if (layer.kind === "text") {
        content = <div data-copy-key={layer.copyKey} style={{ ...style, fontSize: layer.fontSize,
          lineHeight: 1.2, color: layer.color, transform: `translateY(${rise}px)` }}>{scene.copy[layer.copyKey]}</div>;
      } else if (layer.kind === "image") {
        const asset = scene.assets.find((a) => a.revisionId === layer.assetRevisionId)!;
        content = <Img src={staticFile(asset.objectKey)} style={{ ...style, objectFit: layer.fit }} />;
      } else if (layer.kind === "video") {
        const asset = scene.assets.find((a) => a.revisionId === (scene.stage === "draft" ? layer.draftProxyRevisionId : layer.finalAssetRevisionId))!;
        const contract = scene.resourceContracts.find((c) => c.revisionId === layer.contractRevisionId)!;
        content = scene.stage === "draft" ? <Img src={staticFile(asset.objectKey)} style={{ ...style, objectFit: "contain" }} />
          : <Video src={staticFile(asset.objectKey)} muted style={style} objectFit="contain"
            trimBefore={contract.requirement.kind === "video" ? Math.round(contract.requirement.trimStartSeconds * scene.fps) : 0} />;
      } else if (layer.kind === "audio") {
        const asset = scene.assets.find((a) => a.revisionId === layer.assetRevisionId)!;
        content = <Audio src={staticFile(asset.objectKey)} volume={layer.gain} trimBefore={Math.round(layer.trimStartSeconds * scene.fps)} />;
      } else {
        // Models require an admitted adapter; the independent 3D probe is not one.
        throw new Error("UNSUPPORTED_LAYER: model3d in M00 composition; run the separate probe");
      }
      return <Sequence key={layer.id} from={layer.startFrame} durationInFrames={layer.durationFrames} layout="none">{content}</Sequence>;
    })}
  </AbsoluteFill>;
}
