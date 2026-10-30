import type {DirectionInput,Scene} from './types';
/** All authored scene identities the app exposes, including hook-specific narratives. */
export function issuedScenes(input:DirectionInput):Scene[]{
 return [...new Map([...input.storyboard,...Object.values(input.variantFacts??{}).flatMap(f=>f.storyboard??[])].map(scene=>[scene.id,scene])).values()];
}
