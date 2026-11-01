/**
 * Lossless image methods (from the owner's static-ad workflow): a generated edit or outpaint never replaces an approved
 * picture wholesale. Only the requested region (or only the new margins) is taken from the generation; everything
 * else keeps the original pixels exactly. Pure functions over RGBA buffers so they are testable without a provider.
 */
export type Rgba={width:number;height:number;data:Uint8ClampedArray};
export type Region=[number,number,number,number];
export type MergeReport={method:'region'|'extend';alignment:number;shift:[number,number];outsideIdentical:boolean;seamDelta:number;accepted:boolean;reason?:string};

const lumaAt=(img:Rgba,i:number)=>0.2126*img.data[i*4]+0.7152*img.data[i*4+1]+0.0722*img.data[i*4+2];

function fft(re:Float64Array,im:Float64Array,inverse:boolean){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){const ang=(inverse?2:-2)*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const a=i+k,b=a+len/2,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
function fft2(re:Float64Array,im:Float64Array,n:number,inverse:boolean){
 const r=new Float64Array(n),c=new Float64Array(n);
 for(let y=0;y<n;y++){for(let x=0;x<n;x++){r[x]=re[y*n+x];c[x]=im[y*n+x];}fft(r,c,inverse);for(let x=0;x<n;x++){re[y*n+x]=r[x];im[y*n+x]=c[x];}}
 for(let x=0;x<n;x++){for(let y=0;y<n;y++){r[y]=re[y*n+x];c[y]=im[y*n+x];}fft(r,c,inverse);for(let y=0;y<n;y++){re[y*n+x]=r[y];im[y*n+x]=c[y];}}
}
/** Nearest-sample grayscale thumbnail of size n×n over a sub-rectangle, with an excluded box filled by the mean. */
function thumb(img:Rgba,n:number,exclude?:Region){
 const out=new Float64Array(n*n);let sum=0,count=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const sx=Math.min(img.width-1,Math.floor((x+0.5)*img.width/n)),sy=Math.min(img.height-1,Math.floor((y+0.5)*img.height/n)),v=lumaAt(img,sy*img.width+sx);out[y*n+x]=v;
  const fx=(x+0.5)/n,fy=(y+0.5)/n;if(!exclude||fx<exclude[0]||fx>exclude[2]||fy<exclude[1]||fy>exclude[3]){sum+=v;count++;}}
 const mean=count?sum/count:0;
 if(exclude)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const fx=(x+0.5)/n,fy=(y+0.5)/n;if(fx>=exclude[0]&&fx<=exclude[2]&&fy>=exclude[1]&&fy<=exclude[3])out[y*n+x]=mean;}
 // Hann window against edge effects.
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]=(out[y*n+x]-mean)*(0.5-0.5*Math.cos(2*Math.PI*x/(n-1)))*(0.5-0.5*Math.cos(2*Math.PI*y/(n-1)));
 return out;
}
/** Translation of b relative to a in source pixels, by phase correlation outside the excluded region. */
export function estimateShift(a:Rgba,b:Rgba,exclude?:Region):[number,number]{
 const n=128,ta=thumb(a,n,exclude),tb=thumb(b,n,exclude),ar=Float64Array.from(ta),ai=new Float64Array(n*n),br=Float64Array.from(tb),bi=new Float64Array(n*n);
 fft2(ar,ai,n,false);fft2(br,bi,n,false);
 const re=new Float64Array(n*n),im=new Float64Array(n*n);
 for(let i=0;i<n*n;i++){const r=br[i]*ar[i]+bi[i]*ai[i],m=bi[i]*ar[i]-br[i]*ai[i],mag=Math.hypot(r,m)||1;re[i]=r/mag;im[i]=m/mag;}
 fft2(re,im,n,true);let best=0,bx=0,by=0;for(let i=0;i<n*n;i++)if(re[i]>best){best=re[i];bx=i%n;by=Math.floor(i/n);}
 const dx=bx>n/2?bx-n:bx,dy=by>n/2?by-n:by,coarse:[number,number]=[Math.round(dx*a.width/n),Math.round(dy*a.height/n)];
 // Refine to whole pixels around the coarse peak (one thumbnail cell in each direction).
 const reach=Math.ceil(Math.max(a.width,a.height)/n);let shift=coarse,score=-Infinity;
 for(let oy=-reach;oy<=reach;oy++)for(let ox=-reach;ox<=reach;ox++){const candidate:[number,number]=[coarse[0]+ox,coarse[1]+oy],value=alignmentScore(a,b,candidate,exclude,4);if(value>score){score=value;shift=candidate;}}
 return shift;
}
/** Normalised correlation of a and b (b shifted back by shift) over pixels outside the region, sampled. */
export function alignmentScore(a:Rgba,b:Rgba,shift:[number,number],exclude?:Region,stride=1){
 let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;const step=Math.max(1,Math.floor(Math.min(a.width,a.height)/256))*stride;
 for(let y=0;y<a.height;y+=step)for(let x=0;x<a.width;x+=step){
  const fx=x/a.width,fy=y/a.height;if(exclude&&fx>=exclude[0]&&fx<=exclude[2]&&fy>=exclude[1]&&fy<=exclude[3])continue;
  const bxp=x+shift[0],byp=y+shift[1];if(bxp<0||byp<0||bxp>=b.width||byp>=b.height)continue;
  const va=lumaAt(a,y*a.width+x),vb=lumaAt(b,byp*b.width+bxp);sa+=va;sb+=vb;saa+=va*va;sbb+=vb*vb;sab+=va*vb;n++;
 }
 if(n<16)return 0;const cov=sab/n-(sa/n)*(sb/n),va=saa/n-(sa/n)**2,vb=sbb/n-(sb/n)**2;return va>0&&vb>0?cov/Math.sqrt(va*vb):0;
}
const smooth=(t:number)=>t<=0?0:t>=1?1:t*t*(3-2*t);

/**
 * Region merge: the edit (already resized to the source size) is aligned to the source, colour-matched on a ring
 * around the region, and blended in only inside the feathered box. Pixels outside box+feather stay byte-identical.
 */
export function mergeRegion(source:Rgba,edit:Rgba,region:Region,options:{feather?:number;minAlignment?:number}={}):{image:Rgba;report:MergeReport}{
 if(edit.width!==source.width||edit.height!==source.height)throw new Error('EDIT_SIZE_MISMATCH');
 const W=source.width,H=source.height,feather=Math.max(2,Math.round((options.feather??0.012)*Math.max(W,H)));
 const box=[Math.floor(region[0]*W),Math.floor(region[1]*H),Math.ceil(region[2]*W),Math.ceil(region[3]*H)];
 const shift=estimateShift(source,edit,region),alignment=alignmentScore(source,edit,shift,region);
 const at=(x:number,y:number)=>{const ex=Math.min(W-1,Math.max(0,x+shift[0])),ey=Math.min(H-1,Math.max(0,y+shift[1]));return (ey*W+ex)*4;};
 // Colour offset measured on a ring just outside the box (where both pictures should agree).
 const offset=[0,0,0];let ring=0;
 for(let y=Math.max(0,box[1]-2*feather);y<Math.min(H,box[3]+2*feather);y+=2)for(let x=Math.max(0,box[0]-2*feather);x<Math.min(W,box[2]+2*feather);x+=2){
  const inside=x>=box[0]-feather&&x<box[2]+feather&&y>=box[1]-feather&&y<box[3]+feather;if(inside)continue;
  const s=(y*W+x)*4,e=at(x,y);for(let c=0;c<3;c++)offset[c]+=source.data[s+c]-edit.data[e+c];ring++;
 }
 if(ring)for(let c=0;c<3;c++)offset[c]/=ring;
 const out=new Uint8ClampedArray(source.data);let seam=0,seamN=0;
 for(let y=Math.max(0,box[1]-feather);y<Math.min(H,box[3]+feather);y++)for(let x=Math.max(0,box[0]-feather);x<Math.min(W,box[2]+feather);x++){
  const d=Math.max(box[0]-x,x-(box[2]-1),box[1]-y,y-(box[3]-1),0),alpha=1-smooth(d/feather);if(alpha<=0)continue;
  const s=(y*W+x)*4,e=at(x,y);for(let c=0;c<3;c++)out[s+c]=Math.round(source.data[s+c]*(1-alpha)+(edit.data[e+c]+offset[c])*alpha);
  if(alpha<0.6&&alpha>0.4){seam+=Math.abs(out[s]-source.data[s])+Math.abs(out[s+1]-source.data[s+1])+Math.abs(out[s+2]-source.data[s+2]);seamN+=3;}
 }
 let outsideIdentical=true;
 for(let y=0;y<H&&outsideIdentical;y+=3)for(let x=0;x<W;x+=3){if(x>=box[0]-feather&&x<box[2]+feather&&y>=box[1]-feather&&y<box[3]+feather)continue;const i=(y*W+x)*4;if(out[i]!==source.data[i]||out[i+1]!==source.data[i+1]||out[i+2]!==source.data[i+2]){outsideIdentical=false;break;}}
 const seamDelta=seamN?seam/seamN:0,min=options.minAlignment??0.85,accepted=alignment>=min&&outsideIdentical;
 return {image:{width:W,height:H,data:out},report:{method:'region',alignment:Math.round(alignment*1000)/1000,shift,outsideIdentical,seamDelta:Math.round(seamDelta*10)/10,accepted,...(accepted?{}:{reason:alignment<min?'The edit re-framed the picture; it cannot be merged without visible doubling.':'Pixels outside the region changed.'})}};
}

/** Where the source sits on an extended canvas of the requested aspect, in canvas pixels. */
export function extendLayout(source:{width:number;height:number},aspect:string,place:[number,number]=[0.5,0.5]){
 const [aw,ah]=aspect.split(':').map(Number),target=aw/ah,ratio=source.width/source.height;
 const width=ratio>=target?source.width:Math.round(source.height*target),height=ratio>=target?Math.round(source.width/target):source.height;
 const x=Math.round((width-source.width)*Math.min(1,Math.max(0,place[0]))),y=Math.round((height-source.height)*Math.min(1,Math.max(0,place[1])));
 return {width,height,x,y};
}
/** The padded canvas sent to the image model: the source on flat neutral grey. */
export function paddedCanvas(source:Rgba,layout:{width:number;height:number;x:number;y:number}):Rgba{
 const data=new Uint8ClampedArray(layout.width*layout.height*4);for(let i=0;i<data.length;i+=4){data[i]=128;data[i+1]=128;data[i+2]=128;data[i+3]=255;}
 for(let y=0;y<source.height;y++)data.set(source.data.subarray(y*source.width*4,(y+1)*source.width*4),((y+layout.y)*layout.width+layout.x)*4);
 return {width:layout.width,height:layout.height,data};
}
/**
 * Stitch: the generated canvas (resized to the layout) supplies only the new margins; the original picture is placed
 * back exactly, blended over a narrow band on its inner edges that face new content.
 */
export function stitchExtension(source:Rgba,generated:Rgba,layout:{width:number;height:number;x:number;y:number},options:{feather?:number;minAlignment?:number}={}):{image:Rgba;report:MergeReport}{
 if(generated.width!==layout.width||generated.height!==layout.height)throw new Error('EXTEND_SIZE_MISMATCH');
 const feather=Math.max(2,Math.round((options.feather??0.02)*Math.max(source.width,source.height)));
 const crop:Rgba={width:source.width,height:source.height,data:new Uint8ClampedArray(source.width*source.height*4)};
 for(let y=0;y<source.height;y++)crop.data.set(generated.data.subarray(((y+layout.y)*layout.width+layout.x)*4,((y+layout.y)*layout.width+layout.x+source.width)*4),y*source.width*4);
 const shift=estimateShift(source,crop),alignment=alignmentScore(source,crop,shift);
 const open={left:layout.x>0,right:layout.x+source.width<layout.width,top:layout.y>0,bottom:layout.y+source.height<layout.height};
 // Colour-match the new margins to the original on the shared band.
 const offset=[0,0,0];let n=0;
 for(let y=0;y<source.height;y+=2)for(let x=0;x<source.width;x+=2){const d=Math.min(open.left?x:Infinity,open.right?source.width-1-x:Infinity,open.top?y:Infinity,open.bottom?source.height-1-y:Infinity);if(d>feather)continue;const s=(y*source.width+x)*4,cx=Math.min(source.width-1,Math.max(0,x+shift[0])),cy=Math.min(source.height-1,Math.max(0,y+shift[1])),k=(cy*source.width+cx)*4;for(let c=0;c<3;c++)offset[c]+=source.data[s+c]-crop.data[k+c];n++;}
 if(n)for(let c=0;c<3;c++)offset[c]/=n;
 // Sample the generation shifted back onto the original's grid so its margins meet the original without doubling.
 const out=new Uint8ClampedArray(generated.data.length);
 for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++){const gx=Math.min(layout.width-1,Math.max(0,x+shift[0])),gy=Math.min(layout.height-1,Math.max(0,y+shift[1])),g=(gy*layout.width+gx)*4,t=(y*layout.width+x)*4;for(let c=0;c<3;c++)out[t+c]=Math.max(0,Math.min(255,Math.round(generated.data[g+c]+offset[c])));out[t+3]=255;}
 let seam=0,seamN=0;
 for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
  const d=Math.min(open.left?x:Infinity,open.right?source.width-1-x:Infinity,open.top?y:Infinity,open.bottom?source.height-1-y:Infinity),alpha=d===Infinity?1:smooth(d/feather);
  const s=(y*source.width+x)*4,t=((y+layout.y)*layout.width+layout.x+x)*4;
  for(let c=0;c<3;c++)out[t+c]=Math.round(source.data[s+c]*alpha+out[t+c]*(1-alpha));out[t+3]=255;
  if(alpha>0.4&&alpha<0.6){seam+=Math.abs(source.data[s]-out[t])+Math.abs(source.data[s+1]-out[t+1])+Math.abs(source.data[s+2]-out[t+2]);seamN+=3;}
 }
 let insideIdentical=true;
 for(let y=feather;y<source.height-feather&&insideIdentical;y+=3)for(let x=feather;x<source.width-feather;x+=3){const s=(y*source.width+x)*4,t=((y+layout.y)*layout.width+layout.x+x)*4;if(out[t]!==source.data[s]||out[t+1]!==source.data[s+1]||out[t+2]!==source.data[s+2]){insideIdentical=false;break;}}
 const min=options.minAlignment??0.8,accepted=alignment>=min&&insideIdentical;
 return {image:{width:layout.width,height:layout.height,data:out},report:{method:'extend',alignment:Math.round(alignment*1000)/1000,shift,outsideIdentical:insideIdentical,seamDelta:Math.round((seamN?seam/seamN:0)*10)/10,accepted,...(accepted?{}:{reason:'The model changed the original area; the extension cannot be stitched without visible doubling.'})}};
}

export type SketchShape={role:'subject'|'object'|'horizon'|'copy'|'light';box:Region;tone:'light'|'mid'|'dark'};
