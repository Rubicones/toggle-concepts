import type * as Fontkit from 'fontkit';
type Font=ReturnType<typeof Fontkit.create>&{familyName:string};

/** Technical font facts read from the actual bytes (the same fields brand intake records for supplied fonts). */
export function fontMetadata(font:Font,bytes:Uint8Array){
 const f=font as unknown as {familyName:string;subfamilyName:string;postscriptName:string;numGlyphs:number;characterSet:number[];unitsPerEm:number;copyright:string;variationAxes?:Record<string,{min:number;max:number}>;layout:(s:string)=>{positions:{xAdvance:number}[]};'OS/2'?:{usWeightClass?:number;fsType?:number}};
 const advance=(sample:string)=>f.layout(sample).positions.reduce((sum,p)=>sum+p.xAdvance,0)/[...sample].length/f.unitsPerEm,axis=f.variationAxes?.wght;
 return {container:Buffer.from(bytes.subarray(0,4)).toString('ascii'),averageAdvanceByScript:Object.fromEntries([['latin','abcdefghijklmnopqrstuvwxyz'],['cyrillic','абвгдежзиклмнопрстуфхцчшщ']].filter(([,sample])=>[...sample].every(ch=>f.characterSet.includes(ch.codePointAt(0)!))).map(([script,sample])=>[script,advance(sample)])),
  unitsPerEm:f.unitsPerEm,glyphCoverage:f.characterSet,averageAdvance:advance('abcdefghijklmnopqrstuvwxyz'),weight:f['OS/2']?.usWeightClass??400,...(axis?{weightRange:[axis.min,axis.max]}:{}),
  style:/italic/i.test(f.subfamilyName)?'italic':'normal',family:f.familyName,subfamily:f.subfamilyName,postscriptName:f.postscriptName,numGlyphs:f.numGlyphs,characterCount:f.characterSet.length,
  latinBasic:f.characterSet.filter(n=>n>=32&&n<127).length,cyrillic:f.characterSet.filter(n=>n>=0x400&&n<=0x4ff).length,embeddingFlags:f['OS/2']?.fsType??null,copyright:f.copyright};
}

/** The CSS font-weight descriptor: a variable font declares its whole weight range so the browser uses the real axis. */
export function fontWeightDescriptor(metadata:Record<string,unknown>){
 const range=metadata.weightRange;
 if(Array.isArray(range)&&range.length===2&&range.every(n=>Number.isFinite(n))&&Number(range[0])<Number(range[1]))return `${Math.round(Number(range[0]))} ${Math.round(Number(range[1]))}`;
 return String(metadata.weight??400);
}
