/** Recorded pending-picture data for the live-component test fixture. */
export const resources:Record<string,{ready:boolean;url:string}>={picture:{ready:false,url:''}};
/** Recorded copy bindings for the layout-inspection fixture (the workspace module supplies real values). */
export const variants:readonly {id:string;format:string;locale:string;hook:string;cta:string;length:number}[]=[];
export const variantFacts:Record<string,{sceneCopy:Record<string,string[]>;required:string[]}>={};
