/** Trusted Canvas2D text telemetry; no placement or typography is changed. */
type Draw={canvas:HTMLCanvasElement;text:string;x:number;y:number;width:number;height:number;fontSize:number;fontFamily:string;color:string};
let draws:Draw[]=[],inkless=false;
export function beginCanvasAudit(hideInk:boolean){draws=[];inkless=hideInk;}
export function canvasText(root:HTMLElement,origin:DOMRect,scale:number){return draws.filter(d=>root.contains(d.canvas)).map(d=>{const r=d.canvas.getBoundingClientRect(),sx=r.width/d.canvas.width/scale,sy=r.height/d.canvas.height/scale;return {text:d.text,x:(r.x-origin.x)/scale+d.x*sx,y:(r.y-origin.y)/scale+d.y*sy,width:d.width*sx,height:d.height*sy,fontSize:d.fontSize*Math.min(sx,sy),fontFamily:d.fontFamily,color:d.color,opacity:1};});}
if(typeof CanvasRenderingContext2D!=='undefined'){
 for(const method of ['fillText','strokeText'] as const){const native=CanvasRenderingContext2D.prototype[method];CanvasRenderingContext2D.prototype[method]=function(text:string,x:number,y:number,maxWidth?:number){
  const metrics=this.measureText(text),m=this.getTransform(),fontSize=Number(this.font.match(/([\d.]+)px/)?.[1]??0),fontFamily=this.font.replace(/^.*?[\d.]+px\s*/,''),width=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,shrink=maxWidth&&metrics.width>maxWidth?maxWidth/metrics.width:1;
  if(this.canvas instanceof HTMLCanvasElement&&text.trim()){const left=x-metrics.actualBoundingBoxLeft*shrink,top=y-metrics.actualBoundingBoxAscent,points=[[left,top],[left+width*shrink,top],[left,top+metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent],[left+width*shrink,top+metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);draws.push({canvas:this.canvas,text,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),fontSize:fontSize*Math.min(Math.hypot(m.a,m.b)*shrink,Math.hypot(m.c,m.d)),fontFamily,color:String(method==='fillText'?this.fillStyle:this.strokeStyle)});}
  if(!inkless){if(maxWidth===undefined)native.call(this,text,x,y);else native.call(this,text,x,y,maxWidth);}
 };}
}
