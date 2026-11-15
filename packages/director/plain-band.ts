// The largest band of plain ground in a rendered frame: consecutive full-width rows (or full-height columns) of one
// flat colour with nothing in them. Bench run 6 of 2026-11-14: a vertical format left about a fifth of its canvas as an
// empty block at the bottom and every measurement said "0 to fix", because the measurements read elements, not the
// picture. This reads the picture. Pure: it takes pixels and returns shares; the browser driver supplies the pixels.

export type PlainBand={/** share of the frame's height (rows) or width (columns) */share:number;edge:'top'|'bottom'|'left'|'right'|'middle'};
export type PlainBands={rows:PlainBand|null;columns:PlainBand|null};
/** How far a channel may vary along a line, and between neighbouring lines, to count as one flat colour (JPEG noise). */
export const PLAIN_TOLERANCE=14;

function largest(lines:{plain:boolean;colour:[number,number,number]}[],first:'top'|'left',last:'bottom'|'right'):PlainBand|null{
 let best:{from:number;to:number}|null=null,start=-1;const n=lines.length;
 for(let i=0;i<=n;i++){
  const line=lines[i],same=line?.plain&&start>=0&&line.colour.every((c,k)=>Math.abs(c-lines[start].colour[k])<=PLAIN_TOLERANCE);
  if(same)continue;
  if(start>=0&&(!best||i-start>best.to-best.from))best={from:start,to:i};
  start=line?.plain?i:-1;
 }
 if(!best||!n)return null;
 return {share:Math.round((best.to-best.from)/n*100)/100,edge:best.from===0?first:best.to===n?last:'middle'};
}
/** The largest plain band by rows and by columns, from RGBA pixels (any size; a small copy of the frame is enough). */
export function plainBands(pixels:{width:number;height:number;data:ArrayLike<number>}):PlainBands{
 const {width:w,height:h,data}=pixels;if(!w||!h)return {rows:null,columns:null};
 const line=(count:number,at:(i:number)=>number)=>{const lo=[255,255,255],hi=[0,0,0];for(let i=0;i<count;i++){const o=at(i);for(let k=0;k<3;k++){const v=data[o+k];if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v;}}
  const mid=at(count>>1);return {plain:hi.every((v,k)=>v-lo[k]<=PLAIN_TOLERANCE),colour:[data[mid],data[mid+1],data[mid+2]] as [number,number,number]};};
 const rows=Array.from({length:h},(_,y)=>line(w,x=>(y*w+x)*4)),columns=Array.from({length:w},(_,x)=>line(h,y=>(y*w+x)*4));
 return {rows:largest(rows,'top','bottom'),columns:largest(columns,'left','right')};
}
/** The share of the picture taken by its one most common colour (colours within the plain tolerance of it): how much of
 * the frame is flat ground. A measurement, not a judgement. */
export function flatShare(pixels:{width:number;height:number;data:ArrayLike<number>}):number{
 const {width:w,height:h,data}=pixels,n=w*h;if(!n)return 0;
 const bins=new Map<number,number>();for(let i=0;i<n;i++){const o=i*4,k=(data[o]>>4)<<8|(data[o+1]>>4)<<4|(data[o+2]>>4);bins.set(k,(bins.get(k)??0)+1);}
 const top=[...bins.entries()].sort((a,b)=>b[1]-a[1])[0][0],c=[((top>>8)&15)*16+8,((top>>4)&15)*16+8,(top&15)*16+8];let same=0;
 for(let i=0;i<n;i++){const o=i*4;if(Math.abs(data[o]-c[0])<=PLAIN_TOLERANCE&&Math.abs(data[o+1]-c[1])<=PLAIN_TOLERANCE&&Math.abs(data[o+2]-c[2])<=PLAIN_TOLERANCE)same++;}
 return Math.round(same/n*100)/100;
}
/** A band is reported from this share of the side on, and only when it is this much larger than the same scene's band
 * in the reference format (calm space that the accepted composition already has is the designer's choice). */
export const PLAIN_BAND_SHARE=0.15,PLAIN_BAND_OVER_REFERENCE=0.06;
