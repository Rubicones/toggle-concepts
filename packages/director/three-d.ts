// Chat-shaped plan C8: what the final adds to a version 4 draft that holds code-built 3D scenes. The draft shows one
// rendered frame; the final animates the same scene. Read from the designer's own files: each <Scene3D> says in its
// `final` prop what the final does with it; without it, the object turns in 3D. Plain sentences, never ids.
import ts from 'typescript';

export const DEFAULT_FINAL_3D='This object turns in 3D.';
const sentence=(t:string)=>{const s=t.trim().replace(/\s+/g,' ');if(!s)return '';const u=s[0].toUpperCase()+s.slice(1);return /[.!?…]$/.test(u)?u:u+'.';};
/** One line per code-built 3D scene in the files (repeats once), in source order. */
export function code3dNotes(files:{path:string;source:string}[]):string[]{
 const out:string[]=[];
 for(const f of files.filter(f=>/\.(tsx|ts)$/.test(f.path)&&f.path!=='kit3d.ts')){
  const tree=ts.createSourceFile(f.path,f.source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=(n:ts.Node)=>{
   if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&n.tagName.getText(tree)==='Scene3D'){
    const attr=n.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='final') as ts.JsxAttribute|undefined;
    const value=attr?.initializer&&ts.isStringLiteral(attr.initializer)?attr.initializer.text:attr?.initializer&&ts.isJsxExpression(attr.initializer)&&attr.initializer.expression&&ts.isStringLiteralLike(attr.initializer.expression)?attr.initializer.expression.text:'';
    out.push(value?sentence(`In the final this object ${value.replace(/^(?:in the final(?: this object)?\s*)/i,'')}`):DEFAULT_FINAL_3D);
   }
   ts.forEachChild(n,visit);
  };visit(tree);
 }
 return [...new Set(out)];
}
/** The 3D mechanics the designer reads in stage E (and as the catalogue entry kit-3d): how, not what. */
export const THREE_D_MECHANICS=`3D IN THIS DRAFT. A rendered object or scene can be built in code: import {Scene3D} from './kit3d' and draw it with <Scene3D width={…} height={…} build={(THREE,{scene,camera,random})=>{…}} final="turns slowly on its axis"/>. In build, add the geometry, materials and lights with THREE and place the camera; random() is seeded, never Math.random. The draft renders one frame; the final animates the same scene, as final says. A generated model of a picture you asked for is placed with <Scene3D … model={resources[id]}/>: its picture shows until a model exists. Keep the object inside its canvas and the frame, and keep the approved words readable over it.`;
