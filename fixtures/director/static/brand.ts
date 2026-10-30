// Typecheck-only fixture module. The renderer generates this module from approved inputs.
import input from './input.json';
export const brand=input.brand;
export const copy=brand.copy;
export const variants=input.variants;
export const variantFacts:Record<string,{sceneCopy:Record<string,string[]>;required:string[]}>={};
