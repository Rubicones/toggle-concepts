/**
 * Objective facts about an arrived still, measured from its pixels. They tell the coder where the picture's subject
 * sits and which areas are calm or busy, light or dark, so it can choose crop, text side and a legibility technique.
 * Saliency is approximate (spectral residual + colour contrast + a centre prior); the director's planned subject position
 * stays the primary intent. These are measurements only: the application never places copy or picks a technique from them.
 */
export type ImageFacts={
 /** Measurement method version. */
 v:1;
 /** Most salient area as [x0,y0,x1,y1] fractions of the image. */
 subject:[number,number,number,number];
 /** Saliency-weighted centre [x,y] as fractions; a good default object-position. */
 focus:[number,number];
 /** Mean luminance 0..1 of a 3x3 grid, row by row from the top-left. */
 luma:number[];
 /** Edge density 0..1 of the same grid; low values are calm areas for type. */
 busy:number[];
 /** Grid cell indexes (0..8) that are calm and outside the subject, calmest first. */
 calm:number[];
};

const N=64;

function fft1(re:Float64Array,im:Float64Array,inverse:boolean){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){
  const ang=(inverse?2:-2)*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
  for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const a=i+k,b=a+len/2,tr=re[b]*cr-im[b]*ci,ti=re[b]*ci+im[b]*cr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr;}}
 }
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
function fft2(re:Float64Array,im:Float64Array,inverse:boolean){
 const r=new Float64Array(N),c=new Float64Array(N);
 for(let y=0;y<N;y++){for(let x=0;x<N;x++){r[x]=re[y*N+x];c[x]=im[y*N+x];}fft1(r,c,inverse);for(let x=0;x<N;x++){re[y*N+x]=r[x];im[y*N+x]=c[x];}}
 for(let x=0;x<N;x++){for(let y=0;y<N;y++){r[y]=re[y*N+x];c[y]=im[y*N+x];}fft1(r,c,inverse);for(let y=0;y<N;y++){re[y*N+x]=r[y];im[y*N+x]=c[y];}}
}
function blur(src:Float64Array,radius:number){
 const tmp=new Float64Array(N*N),out=new Float64Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0,k=0;for(let d=-radius;d<=radius;d++){const xx=x+d;if(xx>=0&&xx<N){s+=src[y*N+xx];k++;}}tmp[y*N+x]=s/k;}
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let s=0,k=0;for(let d=-radius;d<=radius;d++){const yy=y+d;if(yy>=0&&yy<N){s+=tmp[yy*N+x];k++;}}out[y*N+x]=s/k;}
 return out;
}
const round=(v:number)=>Math.round(v*100)/100;
function normalize(a:Float64Array){let max=0;for(const v of a)max=Math.max(max,v);return max>0?a.map(v=>v/max):a;}

/** Luminance of a 64x64 RGBA sample (any aspect, stretched); returns facts in fractions of the original image. */
export function measureImageFacts(rgba:Uint8Array|Uint8ClampedArray,size=N):ImageFacts{
 if(size!==N||rgba.length!==N*N*4)throw new Error('IMAGE_FACTS_SAMPLE_INVALID');
 const lum=new Float64Array(N*N),rgb=[new Float64Array(N*N),new Float64Array(N*N),new Float64Array(N*N)];
 for(let i=0;i<N*N;i++){const a=rgba[i*4+3]/255;for(let c=0;c<3;c++)rgb[c][i]=(rgba[i*4+c]/255)*a+(1-a);lum[i]=0.2126*rgb[0][i]+0.7152*rgb[1][i]+0.0722*rgb[2][i];}
 // Spectral-residual saliency (Hou & Zhang, 2007).
 const re=Float64Array.from(lum),im=new Float64Array(N*N);fft2(re,im,false);
 const logAmp=new Float64Array(N*N),phase=new Float64Array(N*N);
 for(let i=0;i<N*N;i++){logAmp[i]=Math.log(1e-9+Math.hypot(re[i],im[i]));phase[i]=Math.atan2(im[i],re[i]);}
 const avg=blur(logAmp,1);
 for(let i=0;i<N*N;i++){const m=Math.exp(logAmp[i]-avg[i]);re[i]=m*Math.cos(phase[i]);im[i]=m*Math.sin(phase[i]);}
 fft2(re,im,true);
 const raw=new Float64Array(N*N);for(let i=0;i<N*N;i++)raw[i]=re[i]*re[i]+im[i]*im[i];
 const spectral=normalize(blur(blur(raw,2),2));
 // Frequency-tuned colour contrast (Achanta et al., 2009): distance of each smoothed pixel from the image mean colour.
 // It finds whole objects on plain backgrounds, which spectral residual alone outlines only at their edges.
 const smooth=rgb.map(ch=>blur(ch,1)),mean=rgb.map(ch=>ch.reduce((a,b)=>a+b,0)/(N*N));
 const tuned=normalize(Float64Array.from({length:N*N},(_,i)=>Math.hypot(smooth[0][i]-mean[0],smooth[1][i]-mean[1],smooth[2][i]-mean[2])));
 // A mild centre prior: photographers and our briefs keep the subject inside the central area.
 const centre=(i:number)=>Math.exp(-(((i%N+0.5)/N-0.5)**2+((Math.floor(i/N)+0.5)/N-0.5)**2)/(2*0.35**2));
 const norm=normalize(Float64Array.from({length:N*N},(_,i)=>(0.7*spectral[i]+0.3*tuned[i])*centre(i)));
 // Subject: the strongest connected salient region (cells above the 85th percentile and half the peak); focus: its
 // saliency-weighted centroid. Several people or objects keep only the dominant one.
 const sorted=Array.from(norm).sort((a,b)=>a-b),threshold=Math.max(0.5,sorted[Math.floor(N*N*0.85)]);
 const label=new Int32Array(N*N).fill(-1);let best={mass:0,x0:0,y0:0,x1:-1,y1:-1,sx:0,sy:0};
 for(let start=0;start<N*N;start++){
  if(label[start]>=0||norm[start]<threshold)continue;
  const stack=[start];label[start]=start;const c={mass:0,x0:N,y0:N,x1:-1,y1:-1,sx:0,sy:0};
  while(stack.length){const k=stack.pop()!,x=k%N,y=(k-x)/N,v=norm[k];c.mass+=v;c.sx+=v*(x+0.5);c.sy+=v*(y+0.5);c.x0=Math.min(c.x0,x);c.y0=Math.min(c.y0,y);c.x1=Math.max(c.x1,x);c.y1=Math.max(c.y1,y);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*N+xx;if(xx>=0&&yy>=0&&xx<N&&yy<N&&label[n]<0&&norm[n]>=threshold){label[n]=start;stack.push(n);}}}
  if(c.mass>best.mass)best=c;
 }
 const subject:[number,number,number,number]=best.x1<0?[0.25,0.25,0.75,0.75]:[round(best.x0/N),round(best.y0/N),round((best.x1+1)/N),round((best.y1+1)/N)];
 const focus:[number,number]=best.mass>0?[round(best.sx/best.mass/N),round(best.sy/best.mass/N)]:[0.5,0.5];
 // Sobel edge magnitude for busyness.
 const edge=new Float64Array(N*N);
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const p=(dx:number,dy:number)=>lum[(y+dy)*N+x+dx];const gx=p(1,-1)+2*p(1,0)+p(1,1)-p(-1,-1)-2*p(-1,0)-p(-1,1),gy=p(-1,1)+2*p(0,1)+p(1,1)-p(-1,-1)-2*p(0,-1)-p(1,-1);edge[y*N+x]=Math.min(1,Math.hypot(gx,gy)/2);}
 const luma:number[]=[],busy:number[]=[],inSubject:number[]=[];
 for(let gy=0;gy<3;gy++)for(let gx=0;gx<3;gx++){
  const ax=Math.floor(gx*N/3),bx=Math.floor((gx+1)*N/3),ay=Math.floor(gy*N/3),by=Math.floor((gy+1)*N/3);let l=0,e=0,s=0,k=0;
  for(let y=ay;y<by;y++)for(let x=ax;x<bx;x++){l+=lum[y*N+x];e+=edge[y*N+x];s+=x>=subject[0]*N&&x<subject[2]*N&&y>=subject[1]*N&&y<subject[3]*N?1:0;k++;}
  luma.push(round(l/k));busy.push(round(Math.min(1,(e/k)*2.5)));inSubject.push(s/k);
 }
 const calm=busy.map((b,i)=>({i,b})).filter(c=>c.b<=0.25&&inSubject[c.i]<0.25).sort((a,b)=>a.b-b.b).map(c=>c.i);
 return {v:1,subject,focus,luma,busy,calm};
}
