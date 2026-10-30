'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Disclosure} from '@/components/ui/disclosure';
import {evidenceText,humanLabel,scenarioPresentation,technicalField} from '@/packages/contracts/run-presentation';
import {planningField,planningObject} from '@/packages/director/planning';
import styles from './planning-output.module.css';

export function PlanningOutput({value}:{value:unknown}){
 const directions=scenarioPresentation(value),[chosen,setChosen]=useState(0);
 if(directions){const direction=directions[Math.min(chosen,directions.length-1)];return <div className={styles.editorial}>
  {directions.length>1&&<nav className={styles.tabs} aria-label="Creative directions">{directions.map((d,i)=><button key={d.id} type="button" aria-pressed={i===chosen} onClick={()=>setChosen(i)}>{d.title}</button>)}</nav>}
  <header className={styles.concept}>{direction.premise&&<p>{direction.premise}</p>}{direction.hook&&<blockquote>{direction.hook}</blockquote>}{direction.cta&&<p className={styles.cta}><span>Call to action</span>{direction.cta}</p>}</header>
  {!!direction.scenes.length&&<section aria-label={`${direction.title} storyboard`}><div className={styles.heading}><h4>Story beats</h4><span>{direction.scenes.length} scenes</span></div><ol className={styles.beats}>{direction.scenes.map((scene,index)=><li key={`${scene.id}:${index}`}><div className={styles.time}><strong>{String(index+1).padStart(2,'0')}</strong>{scene.start!==''&&<span>{scene.start}{scene.end!==''?`–${scene.end}`:''}s</span>}</div><div className={styles.scene}>{scene.copy&&<p className={styles.copy}>{scene.copy}</p>}{scene.visual&&<p>{scene.visual}</p>}{(scene.narration||scene.motion||scene.audio)&&<Disclosure><summary>Voice, sound and later motion</summary><dl>{scene.narration&&<><dt>Voiceover</dt><dd>{scene.narration}</dd></>}{scene.audio&&<><dt>Sound</dt><dd>{scene.audio}</dd></>}{scene.motion&&<><dt>Motion intent</dt><dd>{scene.motion}</dd></>}</dl></Disclosure>}</div></li>)}</ol></section>}
  {!!Object.keys(direction.rest).length&&<Disclosure><summary>Copy, variations and production notes</summary><Evidence value={direction.rest}/></Disclosure>}
 </div>;}
 const o=planningObject(value),territories=planningField(o,['threeTerritories','territories']),treatments=planningField(o,['treatments','visualTreatments']);
 if(Array.isArray(o.localizedCopy)&&o.localizedCopy.length)return <LocalizedCopy rows={o.localizedCopy}/>;
 const collection=Array.isArray(territories)?territories:Array.isArray(treatments)?treatments:null;
 if(collection?.length){const active=Math.min(chosen,collection.length-1),selected=collection[active],collectionKey=Object.keys(o).find(k=>o[k]===collection),rest=Object.fromEntries(Object.entries(o).filter(([k])=>k!==collectionKey));return <div className={styles.editorial}><nav className={styles.tabs} aria-label={territories?'Strategic territories':'Visual treatments'}>{collection.map((item,i)=><button type="button" key={i} aria-pressed={active===i} onClick={()=>setChosen(i)}>{evidenceText(planningField(item,['name','title']))||`${territories?'Territory':'Direction'} ${i+1}`}</button>)}</nav><Evidence value={selected}/>{Object.keys(rest).length>0&&<Disclosure><summary>Shared guidance and constraints</summary><Evidence value={rest}/></Disclosure>}</div>;}
 const manifest=planningObject(o.manifest),entries=manifest.entries;
 if(Array.isArray(entries))return <div className={styles.editorial}><div className={styles.scope}><strong>{entries.length}</strong><span>ordered output combinations</span></div><p>The saved order defines the scope. Preview switches explore these bindings without generating separate compositions.</p><dl className={styles.facts}>{['locale','hook','offer','beatSequence','durationSeconds','placementId'].map(key=>{const values=[...new Set(entries.map(e=>planningObject(e)[key]).filter(v=>v!==undefined))];return values.length?<div key={key}><dt>{humanLabel(key)}</dt><dd>{values.map(evidenceText).join(' · ')}</dd></div>:null;})}</dl><Evidence value={Object.fromEntries(Object.entries(o).filter(([k])=>!['manifest','orderedCount'].includes(k)))}/></div>;
 return <Evidence value={value}/>;
}
function LocalizedCopy({rows}:{rows:unknown[]}){
 const locales=[...new Set(rows.map(row=>evidenceText(planningField(row,['locale','language']))).filter(Boolean))], [chosen,setChosen]=useState(''),locale=locales.includes(chosen)?chosen:locales[0];
 const visible=rows.filter(row=>!locale||evidenceText(planningField(row,['locale','language']))===locale);
 return <div className={styles.editorial}>{locales.length>1&&<nav className={styles.tabs} aria-label="Copy language">{locales.map(value=><button type="button" key={value} aria-pressed={locale===value} onClick={()=>setChosen(value)}>{value}</button>)}</nav>}<div className={styles.heading}><h4>Approved language bindings</h4><span>{visible.length} copy entries{locale?` · ${locale}`:''}</span></div><ol className={styles.beats}>{visible.map((row,index)=>{const o=planningObject(row),slot=evidenceText(planningField(o,['copySlot','slot'])),copy=evidenceText(planningField(o,['text','copy','translation']));return <li key={index}><div className={styles.time}><strong>{String(index+1).padStart(2,'0')}</strong><span>{/^(hook|cta|legal|offer)$/i.test(slot)?humanLabel(slot):'Copy'}</span></div><div className={styles.scene}><p className={styles.copy}>{copy}</p>{!!o.terminologyNotes&&<Evidence value={o.terminologyNotes}/>}<Disclosure><summary>Binding and translation notes</summary><Evidence value={Object.fromEntries(Object.entries(o).filter(([k])=>!['text','copy','translation','terminologyNotes'].includes(k)))}/></Disclosure></div></li>;})}</ol></div>;
}
/** Flat editorial evidence with bounded lists, never recursive cards or technical ID walls. */
export function Evidence({value,depth=0}:{value:unknown;depth?:number}){
 const [limit,setLimit]=useState(10);
 if(value==null||value===''||Array.isArray(value)&&!value.length)return null;
 if(typeof value!=='object')return <p className={styles.prose}>{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</p>;
 if(depth>=4)return <p className={styles.prose}>{evidenceText(value)}</p>;
 if(Array.isArray(value))return <><ul className={styles.list}>{value.slice(0,limit).map((v,i)=><li key={i}><Evidence value={v} depth={depth+1}/></li>)}</ul>{value.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+20)}>Show more · {value.length-limit} remaining</Button>}</>;
 const entries=Object.entries(value).filter(([key,v])=>!technicalField(key)&&v!=null&&v!==''&&(!Array.isArray(v)||v.length));
 return <dl className={styles.facts}>{entries.map(([key,v])=><div key={key}><dt>{humanLabel(key)}</dt><dd><Evidence value={v} depth={depth+1}/></dd></div>)}</dl>;
}
