import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

// Capability probe only: real geometry, lighting, and random-access rotation.
// This does not certify imported GLB, photorealism, or any generation provider.
export function ThreeProbe() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  return <AbsoluteFill style={{ backgroundColor: "#182222" }}>
    <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 5], fov: 40 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={3} />
      <mesh rotation={[0.35, frame / fps, 0.15]} onAfterRender={(renderer) => {
        renderer.domElement.dataset.probeFrame = String(frame);
      }}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#c4d986" roughness={0.35} metalness={0.2} />
      </mesh>
    </ThreeCanvas>
  </AbsoluteFill>;
}
