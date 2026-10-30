import type {GlyphSnapshot} from '../engine/text-snapshot';
type WithGlyphs={engine:{glyphs:GlyphSnapshot}};
const empty=():GlyphSnapshot=>({fonts:[],units:[],paths:[]});
/**
 * Every program carries a frozen glyph snapshot, and the same glyphs repeat across all formats and durations.
 * Stored results keep one shared snapshot instead (a union: lookups are by font/weight/text and glyph id),
 * which keeps compile results and batches small enough for the database.
 */
export function packGlyphs<T extends WithGlyphs>(programs:T[],extra?:GlyphSnapshot|null):{programs:T[];glyphs:GlyphSnapshot}{
 const fonts=new Map<string,number>(),units=new Map<string,GlyphSnapshot['units'][number][1]>(),paths=new Map<string,string>();
 for(const snapshot of [...(extra?[extra]:[]),...programs.map(p=>p.engine.glyphs)]){for(const [k,v] of snapshot.fonts)fonts.set(k,v);for(const [k,v] of snapshot.units)units.set(k,v);for(const [k,v] of snapshot.paths)paths.set(k,v);}
 return {programs:programs.map(p=>({...p,engine:{...p.engine,glyphs:empty()}})),glyphs:{fonts:[...fonts],units:[...units],paths:[...paths]}};
}
export function unpackGlyphs<T extends WithGlyphs>(programs:T[],shared:GlyphSnapshot|null|undefined):T[]{
 if(!shared)return programs;
 return programs.map(p=>p.engine.glyphs.fonts.length||p.engine.glyphs.units.length||p.engine.glyphs.paths.length?p:{...p,engine:{...p.engine,glyphs:shared}});
}
