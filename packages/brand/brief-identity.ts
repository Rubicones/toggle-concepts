import type {BrandSystem} from '../contracts/creative-drafts';
/** Admission and staleness checks must resolve the same accepted C1 identity. */
export function fillBriefIdentity(brand:BrandSystem,product:unknown){
 if(!brand.product.name&&typeof product==='string'){brand.product.name=product;brand.fallbacks.push({path:'product.name',reason:'Accepted C1 product identity',value:product});}
 return brand;
}
