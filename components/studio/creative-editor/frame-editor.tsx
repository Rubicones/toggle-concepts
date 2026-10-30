'use client';
import {Select} from '@/components/ui/select';
import {useRef,useState} from 'react';
import type {FrameModel} from '@/packages/engine/sketch/model';
import type {Box} from '@/packages/engine/types';
import styles from './editor.module.css';
/** AD-authored frame boxes. Agents still provide only semantic zones. */
export function FrameEditor({frame,onBox}:{frame:FrameModel;onBox:(layer:string,box:Box)=>void}){
 const ref=useRef<SVGSVGElement>(null),[selected,setSelected]=useState(frame.elements[0]?.id??''),drag=useRef<{id:string;x:number;y:number;box:Box;resize:boolean}|null>(null);
 const element=frame.elements.find(e=>e.id===selected)??frame.elements[0];
 return <div className={styles.frameEditor}><svg ref={ref} viewBox={`0 0 ${frame.w} ${frame.h}`} aria-label="Master layout frame editor" onPointerMove={e=>{const d=drag.current,r=ref.current?.getBoundingClientRect();if(!d||!r)return;const x=(e.clientX-d.x)*frame.w/r.width,y=(e.clientY-d.y)*frame.h/r.height;onBox(d.id,d.resize?{...d.box,w:Math.max(10,Math.min(frame.w-d.box.x,d.box.w+x)),h:Math.max(10,Math.min(frame.h-d.box.y,d.box.h+y))}:{...d.box,x:Math.max(0,Math.min(frame.w-d.box.w,d.box.x+x)),y:Math.max(0,Math.min(frame.h-d.box.h,d.box.y+y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
  <rect width={frame.w} height={frame.h} fill="#edf2f5"/>{frame.regions.map(r=><rect key={r.id} x={r.box.x} y={r.box.y} width={r.box.w} height={r.box.h} fill="none" stroke="#789" strokeWidth="3"/>)}
  {frame.elements.map(el=><g key={el.id} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setSelected(el.id);drag.current={id:el.id,x:e.clientX,y:e.clientY,box:{...el.box},resize:e.shiftKey};}}><rect x={el.box.x} y={el.box.y} width={el.box.w} height={el.box.h} fill={el.id===element?.id?'#0c729330':'#0c729310'} stroke="#0c7293" strokeWidth="4"/><text x={el.box.x+8} y={el.box.y+32} fontSize="26">{el.id} · {el.kind}</text></g>)}
 </svg><p>Drag a box to move it. Shift-drag to resize.</p>{element&&<div className={styles.controls}><label>Layer<Select value={element.id} onChange={e=>setSelected(e.target.value)}>{frame.elements.map(el=><option key={el.id}>{el.id}</option>)}</Select></label>{(['x','y','w','h'] as const).map(k=><label key={k}>{k}<input type="number" min={k==='w'||k==='h'?1:0} value={Math.round(element.box[k])} onChange={e=>onBox(element.id,{...element.box,[k]:Number(e.target.value)})}/></label>)}</div>}</div>;
}
