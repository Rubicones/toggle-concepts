import type {BrandSystem} from '../contracts/creative-drafts';
export function safeArea(brand:BrandSystem,placement:{id:string;width:number;height:number}){
 const fractions=brand.limits.safeZonesByPlacement[placement.id]??{top:.04,right:.04,bottom:.04,left:.04};
 return {top:fractions.top*placement.height,right:fractions.right*placement.width,bottom:fractions.bottom*placement.height,left:fractions.left*placement.width};
}
