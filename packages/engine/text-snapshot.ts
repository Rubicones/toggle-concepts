import type {TextEngine} from './engine/textengine';
export type GlyphSnapshot={fonts:[string,number][];units:[string,{adv:number;glyphs:{gid:number;x:number;y:number}[];ink:{x0:number;y0:number;x1:number;y1:number}}][];paths:[string,string][]};
export type GlyphEngine=Pick<TextEngine,'has'|'missing'|'shape'|'width'|'glyphPath'|'pathScale'>;
/** Frozen shaping and outlines from the approved bytes. No runtime font substitution. */
export function snapshotEngine(snapshot:GlyphSnapshot):GlyphEngine{
 const fonts=new Map(snapshot.fonts),units=new Map(snapshot.units),paths=new Map(snapshot.paths);
 const unit=(key:string,weight:number,text:string)=>{const u=units.get(`${key}\u001f${weight}\u001f${text}`);if(!u)throw new Error(`Unmeasured font input: ${key} ${weight} ${text}`);return u;};
 return {has:key=>fonts.has(key),missing:(key,weight,text)=>[...new Set([...text])].filter(c=>!/\s/.test(c)&&unit(key,weight,c).glyphs.some(g=>g.gid===0)),width:(key,weight,text,size)=>unit(key,weight,text).adv*size,
 shape:(key,weight,text,size)=>{const u=unit(key,weight,text);return {width:u.adv*size,glyphs:u.glyphs.map(g=>({gid:g.gid,x:g.x*size,y:g.y*size})),ink:{x0:u.ink.x0*size,y0:u.ink.y0*size,x1:u.ink.x1*size,y1:u.ink.y1*size},size};},
 glyphPath:(key,weight,gid)=>{const path=paths.get(`${key}\u001f${weight}\u001f${gid}`);if(path===undefined)throw new Error('Unfrozen glyph');return path;},pathScale:key=>{const upem=fonts.get(key);if(!upem)throw new Error('Unfrozen font');return upem*64;}};
}
