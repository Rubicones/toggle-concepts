// Supplied brand files normalised for use in frames. Pure functions; nothing here changes a supplied file.

const STYLE_WORDS=/\s+(?:Thin|Hairline|ExtraLight|Extra Light|UltraLight|Ultra Light|Light|Regular|Book|Normal|Medium|SemiBold|Semi Bold|DemiBold|Demi Bold|Bold|ExtraBold|Extra Bold|UltraBold|Ultra Bold|Black|Heavy|Italic|Oblique)$/i;
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
