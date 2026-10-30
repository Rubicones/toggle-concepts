'use client';
import {Children,isValidElement,useEffect,useId,useRef,useState,type ReactNode,type SelectHTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';
const styles={"field": "studio-select-field", "native": "studio-select-native", "trigger": "studio-select-trigger", "options": "studio-select-options", "option": "studio-select-option"};

type Choice={value:string;label:string;disabled:boolean;group?:string};
const text=(node:ReactNode):string=>Children.toArray(node).map(child=>isValidElement<{children?:ReactNode}>(child)?text(child.props.children):String(child)).join('');
function choices(children:ReactNode,group?:string,disabled=false):Choice[]{
 return Children.toArray(children).flatMap(child=>{
  if(!isValidElement<{children?:ReactNode;value?:string|number;label?:string;disabled?:boolean}>(child))return [];
  if(child.type==='option'){const label=child.props.label??text(child.props.children);return [{value:String(child.props.value??label),label,disabled:disabled||!!child.props.disabled,group}];}
  return choices(child.props.children,child.type==='optgroup'?child.props.label:group,disabled||!!child.props.disabled);
 });
}
/** Styled single-choice control with a native form bridge and keyboard-accessible popup. */
export function Select({children,value,defaultValue,onChange,className,style,id,...props}:Omit<SelectHTMLAttributes<HTMLSelectElement>,'multiple'|'size'>){
 const generated=useId(),listId=`${generated}-options`,options=choices(children),native=useRef<HTMLSelectElement>(null),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [local,setLocal]=useState(String(defaultValue??options[0]?.value??'')),[open,setOpen]=useState(false),[active,setActive]=useState(0),[label,setLabel]=useState(''),[position,setPosition]=useState({left:0,top:0,width:220,maxHeight:280});
 const search=useRef({value:'',at:0}),selected=String(value??local),current=options.find(o=>o.value===selected);
 const name=props['aria-label']??label;
 const place=()=>{const box=trigger.current?.getBoundingClientRect();if(!box)return;const width=Math.min(Math.max(box.width,220),window.innerWidth-24),below=window.innerHeight-box.bottom-12,above=box.top-12,up=below<180&&above>below,height=Math.min(320,Math.max(96,up?above:below));setPosition({left:Math.max(12,Math.min(box.left,window.innerWidth-width-12)),top:up?Math.max(12,box.top-height-6):box.bottom+6,width,maxHeight:height});};
 const show=()=>{if(props.disabled)return;place();const selectedIndex=options.findIndex(o=>o.value===selected&&!o.disabled);setActive(selectedIndex<0?Math.max(0,options.findIndex(o=>!o.disabled)):selectedIndex);setOpen(true);};
 const choose=(index:number)=>{const option=options[index];if(!option||option.disabled||!native.current)return;const element=native.current;element.value=option.value;element.dispatchEvent(new Event('change',{bubbles:true}));setLocal(option.value);setOpen(false);trigger.current?.focus();};
 useEffect(()=>{
  const element=native.current,owner=element?.labels?.[0];
  if(value===undefined)queueMicrotask(()=>setLocal(element?.value??''));
  if(owner){const copy=owner.cloneNode(true) as HTMLElement;copy.querySelectorAll('select,button,[role="listbox"]').forEach(n=>n.remove());queueMicrotask(()=>setLabel(copy.textContent?.trim()??''));}
  const reset=()=>{setTimeout(()=>setLocal(element?.value??''),0);};element?.form?.addEventListener('reset',reset);return()=>element?.form?.removeEventListener('reset',reset);
 },[children,value]);
 useEffect(()=>{
  if(!open)return;const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
  const move=(event:Event)=>{if(!panel.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);window.addEventListener('resize',move);window.addEventListener('scroll',move,true);
  panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',move);window.removeEventListener('scroll',move,true);};
 },[open,active]);
 const keydown=(event:React.KeyboardEvent<HTMLButtonElement>)=>{
  const key=event.key,enabled=options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0);if(!enabled.length)return;
  if(key==='Escape'){setOpen(false);event.preventDefault();return;}if(key==='Tab'){setOpen(false);return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(key)){event.preventDefault();if(!open){show();return;}const at=enabled.indexOf(active),next=key==='Home'?enabled[0]:key==='End'?enabled.at(-1)!:enabled[(at+(key==='ArrowDown'?1:-1)+enabled.length)%enabled.length];setActive(next);return;}
  if(key==='Enter'||key===' '){event.preventDefault();if(open)choose(active);else show();return;}
  if(key.length===1&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();const now=Date.now();search.current={value:(now-search.current.at<700?search.current.value:'')+key.toLocaleLowerCase(),at:now};const found=enabled.find(i=>options[i].label.toLocaleLowerCase().startsWith(search.current.value));if(found!==undefined){if(open)setActive(found);else choose(found);}}
 };
 return <span className={`${styles.field} ${className??''}`} style={style}>
  <select {...props} id={id} ref={native} className={styles.native} tabIndex={-1} aria-hidden="true" value={value} defaultValue={defaultValue} onInvalid={event=>{event.preventDefault();trigger.current?.focus();show();}} onChange={event=>{setLocal(event.target.value);onChange?.(event);}}>{children}</select>
  <button ref={trigger} type="button" role="combobox" aria-label={name||undefined} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} aria-required={props.required||undefined} aria-invalid={props['aria-invalid']} aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" aria-activedescendant={open?`${listId}-${active}`:undefined} disabled={props.disabled} className={styles.trigger} onKeyDown={keydown} onClick={()=>open?setOpen(false):show()}><span>{current?.label??'Choose an option'}</span><ChevronDown size={15} aria-hidden="true"/></button>
  {open&&createPortal(<div ref={panel} id={listId} role="listbox" aria-label={name||'Options'} className={styles.options} style={position}>{options.map((option,index)=><div key={`${option.value}:${index}`} id={`${listId}-${index}`} role="option" aria-selected={selected===option.value} aria-disabled={option.disabled||undefined} data-index={index} data-active={index===active||undefined} className={styles.option} onPointerDown={event=>event.preventDefault()} onMouseEnter={()=>!option.disabled&&setActive(index)} onClick={()=>choose(index)}><span>{option.group&&<small>{option.group}</small>}{option.label}</span>{selected===option.value&&<Check size={15} aria-hidden="true"/>}</div>)}</div>,document.body)}
 </span>;
}
