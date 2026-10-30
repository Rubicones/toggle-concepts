import {parseSvg} from '../engine/engine/svg';
export const MAX_LOGO_SVG_BYTES=64*1024;
/** Keep only the vector subset our renderer understands; never persist metadata or active SVG content. */
export function logoSvg(source:unknown):{svg?:string;mode:'as_drawn'|'one_colour'}{
 if(typeof source!=='string'||source.length>MAX_LOGO_SVG_BYTES*16)return {mode:'as_drawn'};
 const svg=source.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi,'').replace(/<!--[\s\S]*?-->/g,'').trim();
 if(new TextEncoder().encode(svg).length>MAX_LOGO_SVG_BYTES)return {mode:'as_drawn'};
 if(!/<svg\b/i.test(svg)||/<(?:script|foreignObject|image|use|style|linearGradient|radialGradient)\b|\bon\w+\s*=|href\s*=/i.test(svg))return {mode:'as_drawn'};
 const shape=parseSvg(svg);if(!shape.paths.length||shape.paths.length>200||shape.view_box.some(v=>!Number.isFinite(v)||v<=0))return {mode:'as_drawn'};
 const colours=new Set([...svg.matchAll(/(?:fill|stroke)\s*(?:=\s*["']|:\s*)([^"';\s>]+)/gi)].map(m=>m[1].toLowerCase()).filter(c=>!['none','transparent','currentcolor'].includes(c)));
 return {svg,mode:/currentColor/i.test(svg)||colours.size<=1?'one_colour':'as_drawn'};
}
