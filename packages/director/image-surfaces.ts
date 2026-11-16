/**
 * Plain faces in an arrived still, measured from its pixels: a blank card, sheet or screen, and such a face seen again
 * in a mirror or glass. The designer sets exact content on one of them in code (the kit's OnSurface), so the corners
 * must be measured, never judged by eye. Deterministic, no model. Measurements only: the application never decides
 * what goes on a surface or whether one is used.
 *
 * The sample is the picture drawn at its own proportions with its long side at SURFACE_SAMPLE (256) px.
 *
 * The rule, in order:
 *  1. A pixel can belong to a face when it is light and nearly colourless: luminance at least the picture's median
 *     luminance + 0.1 (relative, because a reflection is dimmer than white), never below 0.3, and chroma
 *     (max channel - min channel) at most 0.18. Transparent pixels never belong to a face.
 *  2. Two neighbouring such pixels are the same face when no channel differs by more than 0.04 between them (local
 *     uniformity: slow shading across a face is kept; an edge, a texture or noise ends it). Faces are the 4-connected
 *     groups under this rule, so a face and its dimmer reflection stay apart even when they touch.
 *  3. A group smaller than 1.5% of the frame is dropped. A group that lies along a frame edge for 2% of that edge or
 *     more is dropped: it is a wall, a ground, a sky or a window, or a face cut by the frame, whose corners are outside
 *     the picture and cannot be measured.
 *  4. The group's convex hull is reduced to four sides by repeatedly removing the side whose removal adds the least
 *     area (the two neighbouring sides are extended until they meet), so slightly rounded or soft corners still give
 *     the corners of the face. Each side is then refitted as the least-squares line through the group's outline pixels
 *     next to it, and finally placed to a fraction of a pixel: across the side, the edge is where the luminance crosses
 *     the mean of the face's level and the ground's level (a side with no such edge keeps its outline line; a group
 *     with fewer than three sides that have such an edge is a soft patch of light, not a face, and is dropped).
 *  5. The quadrilateral is kept when the group fills at least 85% of it (a disc fills 79%), its shortest side is at
 *     least 4% of the sample's long side, and no corner lies more than 2% outside the picture.
 * At most four surfaces are returned, largest first; two of nearly the same size (within 10%) are ordered brighter
 * first, so a face comes before its reflection.
 */
export type Surface={
 /** Corners as [x,y] fractions of the image, in the order top-left, top-right, bottom-right, bottom-left as seen in the image. */
 corners:[[number,number],[number,number],[number,number],[number,number]];
 /** Mean luminance 0..1 of the face. A dimmer surface of the same shape is usually a reflection of a brighter one. */
 luma:number;
 /** Area of the face as a fraction of the frame. */
 area:number;
};

/** Long side, in px, of the sample measureSurfaces is meant to receive. */
export const SURFACE_SAMPLE=256;
const MARGIN=0.1,FLOOR=0.3,CHROMA=0.18,STEP=0.04,MIN_AREA=0.015,EDGE_RUN=0.02,FILL=0.85,MIN_SIDE=0.04,OUTSIDE=0.02,MAX_SURFACES=4,REACH=4;

type P=[number,number];
const cross=(o:P,a:P,b:P)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
/** Andrew's monotone chain; the hull runs clockwise as seen in the image (y down), without collinear points. */
function convexHull(points:P[]):P[]{
 const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
 const half=(list:P[])=>{const h:P[]=[];for(const q of list){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],q)<=0)h.pop();h.push(q);}h.pop();return h;};
 return [...half(p),...half([...p].reverse())];
}
/** Where the lines through a→b and c→d meet; null when they are parallel. */
function meet(a:P,b:P,c:P,d:P):P|null{
 const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)return null;
 const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den;return [a[0]+t*rx,a[1]+t*ry];
}
const areaOf=(q:P[])=>Math.abs(q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p[0]*n[1]-n[0]*p[1];},0))/2;

/** The hull's four dominant sides, as lines [a,b]: remove the side that adds the least area until four are left. */
function fourSides(hull:P[]):[P,P][]|null{
 let sides:[P,P][]=hull.map((p,i)=>[p,hull[(i+1)%hull.length]]);
 while(sides.length>4){
  let best=-1,bestArea=Infinity;
  for(let i=0;i<sides.length;i++){
   const prev=sides[(i+sides.length-1)%sides.length],next=sides[(i+1)%sides.length],[a,b]=sides[i];
   // Removing a side is possible only when its neighbours meet beyond it (their turn together is less than 180 degrees).
   const rx=prev[1][0]-prev[0][0],ry=prev[1][1]-prev[0][1],sx=next[1][0]-next[0][0],sy=next[1][1]-next[0][1];if(rx*sy-ry*sx<=1e-9)continue;
   const tip=meet(prev[0],prev[1],next[0],next[1]);if(!tip)continue;
   const added=Math.abs(cross(a,b,tip))/2;if(added<bestArea){bestArea=added;best=i;}
  }
  if(best<0)return null;
  const n=sides.length,prev=sides[(best+n-1)%n],next=sides[(best+1)%n],tip=meet(prev[0],prev[1],next[0],next[1])!;
  prev[1]=tip;next[0]=tip;sides=sides.filter((_,i)=>i!==best);
 }
 return sides.length===4?sides:null;
}

const round3=(v:number)=>Math.round(v*1000)/1000;

/**
 * Plain faces of an RGBA sample (`width`×`height`, the picture at its own proportions, long side SURFACE_SAMPLE).
 * Returns at most four, largest first, in fractions of the image; an empty list when none is measured.
 */
export function measureSurfaces(rgba:Uint8Array|Uint8ClampedArray,width:number,height:number):Surface[]{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||rgba.length!==width*height*4)throw new Error('IMAGE_SURFACES_SAMPLE_INVALID');
 const n=width*height,r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n),lum=new Float32Array(n);
 for(let i=0;i<n;i++){const a=rgba[i*4+3]/255;r[i]=(rgba[i*4]/255)*a+(1-a);g[i]=(rgba[i*4+1]/255)*a+(1-a);b[i]=(rgba[i*4+2]/255)*a+(1-a);lum[i]=0.2126*r[i]+0.7152*g[i]+0.0722*b[i];}
 const median=Float32Array.from(lum).sort()[n>>1],bright=Math.max(FLOOR,median+MARGIN);
 const plain=new Uint8Array(n);for(let i=0;i<n;i++)plain[i]=rgba[i*4+3]>=250&&lum[i]>=bright&&Math.max(r[i],g[i],b[i])-Math.min(r[i],g[i],b[i])<=CHROMA?1:0;
 const same=(i:number,j:number)=>Math.abs(r[i]-r[j])<=STEP&&Math.abs(g[i]-g[j])<=STEP&&Math.abs(b[i]-b[j])<=STEP;
 const label=new Int32Array(n).fill(-1),long=Math.max(width,height),found:{surface:Surface;size:number}[]=[];
 const stack=new Int32Array(n);
 for(let start=0;start<n;start++){
  if(!plain[start]||label[start]>=0)continue;
  // One face: grow through neighbours that are plain and differ little from the pixel they are reached from.
  let top=0,count=0,sum=0;stack[top++]=start;label[start]=start;
  const left=new Int32Array(height).fill(width),right=new Int32Array(height).fill(-1),onEdge=[0,0,0,0];
  while(top){
   const k=stack[--top],x=k%width,y=(k-x)/width;count++;sum+=lum[k];if(x<left[y])left[y]=x;if(x>right[y])right[y]=x;
   if(y===0)onEdge[0]++;if(x===width-1)onEdge[1]++;if(y===height-1)onEdge[2]++;if(x===0)onEdge[3]++;
   if(x>0){const j=k-1;if(plain[j]&&label[j]<0&&same(k,j)){label[j]=start;stack[top++]=j;}}
   if(x<width-1){const j=k+1;if(plain[j]&&label[j]<0&&same(k,j)){label[j]=start;stack[top++]=j;}}
   if(y>0){const j=k-width;if(plain[j]&&label[j]<0&&same(k,j)){label[j]=start;stack[top++]=j;}}
   if(y<height-1){const j=k+width;if(plain[j]&&label[j]<0&&same(k,j)){label[j]=start;stack[top++]=j;}}
  }
  if(count<MIN_AREA*n)continue;
  const runs=[onEdge[0]/width,onEdge[1]/height,onEdge[2]/width,onEdge[3]/height];
  if(runs.some(v=>v>=EDGE_RUN))continue;
  // Hull of the pixel squares (their corners), row by row.
  const points:P[]=[];for(let y=0;y<height;y++)if(right[y]>=0)points.push([left[y],y],[left[y],y+1],[right[y]+1,y],[right[y]+1,y+1]);
  const hull=convexHull(points);if(hull.length<4)continue;
  const sides=fourSides(hull);if(!sides)continue;
  // The outline: the centres of the first and last pixel of the group in every row and every column.
  const outline:P[]=[];for(let y=0;y<height;y++)if(right[y]>=0)outline.push([left[y]+0.5,y+0.5],[right[y]+0.5,y+0.5]);
  for(let x=0;x<width;x++){let first=-1,last=-1;for(let y=0;y<height;y++)if(label[y*width+x]===start){if(first<0)first=y;last=y;}if(first>=0)outline.push([x+0.5,first+0.5],[x+0.5,last+0.5]);}
  // Each side becomes the least-squares line through the outline pixels next to it, so a side is the whole edge of the
  // face, not one short stretch of its hull. Four passes, each from the lines of the pass before and with a shorter reach.
  let lines=sides;
  for(const reach of [4,2.5,1.5,1.5])lines=lines.map(([a,c],i):[P,P]=>{
   const near=outline.filter(p=>{const d=(q:[P,P])=>Math.abs(cross(q[0],q[1],p))/(Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1])||1),mine=d([a,c]);return mine<=reach&&lines.every((q,j)=>j===i||d(q)>=mine);});
   if(near.length<4)return [a,c];
   const mx=near.reduce((t,p)=>t+p[0],0)/near.length,my=near.reduce((t,p)=>t+p[1],0)/near.length;let sxx=0,sxy=0,syy=0;for(const p of near){sxx+=(p[0]-mx)**2;sxy+=(p[0]-mx)*(p[1]-my);syy+=(p[1]-my)**2;}
   const angle=0.5*Math.atan2(2*sxy,sxx-syy);let ux=Math.cos(angle),uy=Math.sin(angle);if(ux*(c[0]-a[0])+uy*(c[1]-a[1])<0){ux=-ux;uy=-uy;}
   return [[mx,my],[mx+ux,my+uy]];
  });
  // Sub-pixel edges: along each side, the luminance is read across the side (bilinear, 4 px to each side) and the edge
  // is where it crosses the mean of the face's level and the ground's level. The side becomes the least-squares line
  // through those crossings, so blur and blended edge pixels do not move it. Twice; the second pass starts from the first.
  const at=(x:number,y:number)=>{const fx=Math.min(width-1,Math.max(0,x-0.5)),fy=Math.min(height-1,Math.max(0,y-0.5)),ix=Math.min(width-2,Math.floor(fx)),iy=Math.min(height-2,Math.floor(fy)),tx=fx-ix,ty=fy-iy,k=iy*width+ix;return (lum[k]*(1-tx)+lum[k+1]*tx)*(1-ty)+(lum[k+width]*(1-tx)+lum[k+width+1]*tx)*ty;};
  const cornersOf=(list:[P,P][])=>{const q:P[]=[];for(let i=0;i<4;i++){const p=meet(list[(i+3)%4][0],list[(i+3)%4][1],list[i][0],list[i][1]);if(!p)return null;q.push(p);}return q;};
  let quad=cornersOf(lines.map(([a,c]):[P,P]=>{const dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy)||1,ox=dy/len*0.5,oy=-dx/len*0.5;return [[a[0]+ox,a[1]+oy],[c[0]+ox,c[1]+oy]];}));
  let measured=0;
  for(let pass=0;pass<2&&quad;pass++){
   const from:P[]=quad;measured=0;
   quad=cornersOf(from.map((a,i):[P,P]=>{
    const c=from[(i+1)%4],dx=c[0]-a[0],dy=c[1]-a[1],len=Math.hypot(dx,dy);if(len<1)return [a,c];
    const ux=dx/len,uy=dy/len,nx=uy,ny=-ux,edge:P[]=[];let tried=0;
    // The ends are left out: a corner may be rounded, and the neighbouring side's edge begins there.
    for(let d=len*0.12;d<=len*0.88;d+=1){
     tried++;const px=a[0]+ux*d,py=a[1]+uy*d;if(px+nx*REACH<0||px+nx*REACH>width||py+ny*REACH<0||py+ny*REACH>height)continue;
     const inside=at(px-nx*REACH,py-ny*REACH),outside=at(px+nx*REACH,py+ny*REACH);if(Math.abs(inside-outside)<0.05)continue;
     const mid=(inside+outside)/2;let before=inside;
     for(let t=-REACH+0.5;t<=REACH;t+=0.5){const v=at(px+nx*t,py+ny*t);if((before-mid)*(v-mid)<=0){const f=v===before?0:(before-mid)/(before-v),e=t-0.5+0.5*f;edge.push([px+nx*e,py+ny*e]);break;}before=v;}
    }
    if(edge.length<Math.max(4,tried*0.5))return [a,c];
    measured++;
    const mx=edge.reduce((t,p)=>t+p[0],0)/edge.length,my=edge.reduce((t,p)=>t+p[1],0)/edge.length;let sxx=0,sxy=0,syy=0;for(const p of edge){sxx+=(p[0]-mx)**2;sxy+=(p[0]-mx)*(p[1]-my);syy+=(p[1]-my)**2;}
    const angle=0.5*Math.atan2(2*sxy,sxx-syy);let vx=Math.cos(angle),vy=Math.sin(angle);if(vx*ux+vy*uy<0){vx=-vx;vy=-vy;}
    return [[mx,my],[mx+vx,my+vy]];
   }));
  }
  if(!quad||measured<3)continue;
  const quadArea=areaOf(quad);if(!(quadArea>0)||count/quadArea<FILL)continue;
  if(quad.some((p,i)=>Math.hypot(p[0]-quad[(i+1)%4][0],p[1]-quad[(i+1)%4][1])<MIN_SIDE*long))continue;
  if(quad.some(p=>p[0]<-OUTSIDE*width||p[0]>(1+OUTSIDE)*width||p[1]<-OUTSIDE*height||p[1]>(1+OUTSIDE)*height))continue;
  // The quad runs clockwise as seen; start it at the corner order that best matches its bounding box's corners.
  const xs=quad.map(p=>p[0]),ys=quad.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),boxCorners:P[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  let turn=0,least=Infinity;for(let s=0;s<4;s++){const d=boxCorners.reduce((t,c,i)=>t+(quad[(i+s)%4][0]-c[0])**2+(quad[(i+s)%4][1]-c[1])**2,0);if(d<least){least=d;turn=s;}}
  const clamp=(v:number)=>Math.min(1,Math.max(0,v));
  const corners=[0,1,2,3].map(i=>{const p=quad[(i+turn)%4];return [round3(clamp(p[0]/width)),round3(clamp(p[1]/height))] as [number,number];}) as Surface['corners'];
  found.push({size:quadArea/n,surface:{corners,luma:round3(sum/count),area:round3(quadArea/n)}});
 }
 found.sort((a,c)=>c.size-a.size);
 // Nearly equal sizes: the brighter one first (a face before its reflection).
 for(let i=0;i<found.length;i++)for(let j=i+1;j<found.length;j++)if(found[j].size>=found[i].size*0.9&&found[j].surface.luma>found[i].surface.luma)[found[i],found[j]]=[found[j],found[i]];
 return found.slice(0,MAX_SURFACES).map(f=>f.surface);
}
