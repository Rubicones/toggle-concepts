// 3D kit (chat-shaped plan C8, designerVersion 4): a code-built three.js scene in a static draft, rendered once.
// Mechanics only: the designer's `build` decides every object, material, light and camera; this file only hosts the
// canvas, renders a single deterministic frame (fixed pixel ratio, seeded randomness, no loop, no clock) and, for a
// generated model, loads it with the picture as the fallback. The final animates the same scene. Copied into each
// version 4 draft workspace as ./kit3d (read-only).
import React, {createElement, useLayoutEffect, useState, type CSSProperties} from 'react';
import {continueRender, delayRender, Img, staticFile} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Deterministic randomness for a scene: the same seed gives the same numbers in the draft and the final. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export type Build = (three: typeof THREE, scene: {scene: THREE.Scene; camera: THREE.PerspectiveCamera; random: () => number; width: number; height: number}) => void;
/** A generated model and its picture: the model when it loads, the picture otherwise. */
export type ModelResource = {url: string; modelUrl?: string; ready?: boolean};

/** Picks what a model resource shows: its model when there is one, else its picture; nothing before it is ready. */
export function modelOrPicture(res: ModelResource | undefined, failed = false): 'model' | 'picture' | 'none' {
  if (!res || res.ready === false || !res.url) return 'none';
  return res.modelUrl && !failed ? 'model' : 'picture';
}

/**
 * One rendered frame of a three.js scene. `build` adds objects, lights and sets the camera; `model` places a generated
 * model (its picture is the fallback). `final` says in plain words what the final animates ("turns slowly on its axis").
 */
export function Scene3D(props: {width: number; height: number; build?: Build; model?: ModelResource; seed?: number; final?: string; style?: CSSProperties; background?: string}) {
  const {width, height, build, model, seed = 1, style, background} = props;
  const [element, setElement] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const show = model ? modelOrPicture(model, failed) : 'model';
  useLayoutEffect(() => {
    if (show !== 'model' || !element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({canvas: element, antialias: true, alpha: !background, preserveDrawingBuffer: true}); }
    catch { if (model) queueMicrotask(() => setFailed(true)); element.setAttribute('data-scene3d-error', 'webgl'); return; }
    renderer.setPixelRatio(1); renderer.setSize(width, height, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(); if (background) scene.background = new THREE.Color(background);
    const camera = new THREE.PerspectiveCamera(35, width / Math.max(1, height), 0.01, 1000); camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
    build?.(THREE, {scene, camera, random: seeded(seed), width, height});
    const draw = () => { renderer.render(scene, camera); element.removeAttribute('data-scene3d-pending'); };
    if (!model?.modelUrl) { draw(); return () => renderer.dispose(); }
    // A generated model: the frame waits for it; a model that cannot load gives way to its picture.
    const handle = delayRender('kit3d model'); element.setAttribute('data-scene3d-pending', '1');
    new GLTFLoader().load(staticFile(model.modelUrl), gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()).length() || 1;
      gltf.scene.position.sub(box.getCenter(new THREE.Vector3())); gltf.scene.scale.setScalar(3 / size); scene.add(gltf.scene);
      if (!scene.children.some(c => (c as THREE.Light).isLight)) { scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2)); }
      draw(); continueRender(handle);
    }, undefined, () => { element.removeAttribute('data-scene3d-pending'); setFailed(true); continueRender(handle); });
    return () => renderer.dispose();
  }, [element, show, width, height, seed, background, build, model]);
  if (show === 'none') return null;
  if (show === 'picture') return createElement(Img, {src: staticFile(model!.url), style: {width, height, objectFit: 'contain', ...style}} as React.ComponentProps<typeof Img>);
  return createElement('canvas', {ref: setElement, width, height, 'data-scene3d': '1', ...(props.final ? {'data-final': props.final} : {}), style: {width, height, display: 'block', ...style}});
}
