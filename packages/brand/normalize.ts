// Supplied brand files normalised for use in frames. Pure functions; nothing here changes a supplied file.

const STYLE_WORDS=/(?:[\s-]+(?:Thin|Hairline|ExtraLight|Extra Light|UltraLight|Ultra Light|ExtLt|ExLt|UltLt|Light|Lt|Regular|Reg|Book|Normal|Medium|Med|SemiBold|Semi Bold|DemiBold|Demi Bold|SmBd|Bold|ExtraBold|Extra Bold|UltraBold|Ultra Bold|ExtBd|ExBd|UltBd|Black|Blk|Heavy|Italic|It|Oblique|Obl)|\s+\d+pt)$/i;
/**
 * A font file's name table often carries the style in the family ("Archivo SemiBold", "JetBrains Mono Medium"), so the
 * same typeface registers under several families and a frame asking for "Archivo" finds none of them. The family is the
 * name without trailing weight/style words; the weight comes from the file itself.
 */
export function normalizeFontFamily(family:string){
 let name=family.replace(/\0/g,'').trim();
 for(let guard=0;guard<4&&STYLE_WORDS.test(name);guard++){const next=name.replace(STYLE_WORDS,'').trim();if(!next)break;name=next;}
 return name;
}

const hex=(value:string)=>{const m=/^#?([0-9a-f]{6})$/i.exec(value.trim());return m?`#${m[1].toUpperCase()}`:null;};
const luminance=(value:string)=>{const n=parseInt(value.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
/** The brand's lightest and darkest neutral colours, used as the ink of a logo drawn in currentColor. */
export function inkColours(colours:string[]){
 // Only near-neutral colours are inks: an accent (a lime, a brand red) would recolour the whole mark.
 const neutral=(c:string)=>{const n=parseInt(c.slice(1),16),ch=[n>>16&255,n>>8&255,n&255];return Math.max(...ch)-Math.min(...ch)<=40;};
 const list=colours.map(hex).filter((c):c is string=>!!c&&neutral(c)).sort((a,b)=>luminance(b)-luminance(a));
 const light=list.find(c=>luminance(c)>=0.7)??'#FFFFFF',dark=[...list].reverse().find(c=>luminance(c)<=0.05)??'#111111';
 return {light,dark};
}
/**
 * An SVG drawn in currentColor takes its colour from the page, but placed as an image it has no page and renders black.
 * The drawing delegates its colour, so resolving it to the brand's light ink (for dark grounds) and dark ink (for light
 * grounds) keeps every shape and every fixed colour exactly as supplied. Returns null when nothing is delegated.
 */
export function logoInkVariants(svg:string,ink:{light:string;dark:string}){
 if(!/currentColor/i.test(svg))return null;
 return {onDark:svg.replace(/currentColor/gi,ink.light),onLight:svg.replace(/currentColor/gi,ink.dark)};
}

const toHex=(channels:number[])=>`#${channels.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase()}`;
const num=(v:string,scale=1)=>v.trim().endsWith('%')?parseFloat(v)/100*scale:parseFloat(v);
/** A CSS colour (hex, rgb(), oklch()) as #RRGGBB; null when it is not one of those. Design tokens are often oklch. */
export function cssColorToHex(value:string):string|null{
 const v=value.trim();
 let m=/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
 if(m){const h=m[1].length<=4?[...m[1].slice(0,3)].map(c=>c+c).join(''):m[1].slice(0,6);return `#${h.toUpperCase()}`;}
 m=/^rgba?\(\s*([^)]+)\)$/i.exec(v);
 if(m){const p=m[1].split(/[\s,/]+/).filter(Boolean);if(p.length<3)return null;const c=p.slice(0,3).map(x=>x.endsWith('%')?parseFloat(x)/100:parseFloat(x)/255);return c.some(Number.isNaN)?null:toHex(c);}
 m=/^oklch\(\s*([^)]+)\)$/i.exec(v);
 if(m){const p=m[1].split(/[\s,/]+/).filter(Boolean);if(p.length<3)return null;const L=num(p[0]),C=num(p[1],0.4),h=parseFloat(p[2])*Math.PI/180;if([L,C].some(Number.isNaN))return null;
  const a=C*Math.cos(Number.isNaN(h)?0:h),b=C*Math.sin(Number.isNaN(h)?0:h);
  const l=(L+0.3963377774*a+0.2158037573*b)**3,mm=(L-0.1055613458*a-0.0638541728*b)**3,s=(L-0.0894841775*a-1.291485548*b)**3;
  const lin=[4.0767416621*l-3.3077115913*mm+0.2309699292*s,-1.2684380046*l+2.6097574011*mm-0.3413193965*s,-0.0041960863*l-0.7034186147*mm+1.707614701*s];
  return toHex(lin.map(x=>x<=0.0031308?12.92*x:1.055*Math.max(0,x)**(1/2.4)-0.055));}
 return null;
}

const STYLE_SUFFIX=/(?:[-\s](?:Thin|Hairline|ExtraLight|UltraLight|ExtLt|ExLt|UltLt|Light|Lt|Regular|Reg|Book|Medium|Med|SemiBold|DemiBold|SmBd|Bold|ExtraBold|UltraBold|ExtBd|ExBd|UltBd|Black|Blk|Heavy|Italic|It|Oblique|Obl)|\s+\d+pt)$/i;
/**
 * The typeface a font finding names, or null when it names none ("weight: 700", "Regular (Subfamily)", a generic
 * fallback). "Archivo (`display`) for names…", "JetBrainsMono-Bold" and "Archivo SemiBold" all name their family.
 */
export function fontFamilyOf(value:string):string|null{
 let v=value;try{const p=JSON.parse(v);if(typeof p==='string')v=p;else if(p&&typeof p==='object')v=String((p as Record<string,unknown>).family??(p as Record<string,unknown>).fontFamily??(p as Record<string,unknown>).name??'');}catch{/* plain text */}
 v=v.replace(/^(?:(?:headline|heading|display|title|body|copy|text|mono|monospace|code|primary|secondary|accent|brand|ui|interface)s?(?:\s+(?:font|typeface|family))?|font(?:\s+family)?|typeface)\s*:\s*/i,'');
 v=v.split(/\s+(?:for|used|is|are)\s+|\s+[—–-]\s+|[,(;:\n/]/i)[0].replace(/["'`*_«»“”]/g,'').trim();
 if(!v||v.length>40||/^(weight|style|subfamily|family|postscript|regular|italic|normal|bold|medium|light|\d)/i.test(v)||/^(sans-serif|serif|monospace|system-ui|ui-|cursive|fantasy|inherit)/i.test(v))return null;
 for(let guard=0;guard<3&&STYLE_SUFFIX.test(v);guard++)v=v.replace(STYLE_SUFFIX,'').trim();
 return normalizeFontFamily(v)||null;
}
