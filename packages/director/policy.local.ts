import ts from 'typescript';
import {realpath,readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,extname,isAbsolute} from 'node:path';
export const limits={renderMs:480000,memoryMb:4096,maxFiles:80,maxSourceBytes:524288,maxOutputBytes:16384,toolCalls:60};
const modules=['react','react/jsx-runtime','react-dom','remotion','gsap','@remotion/media','@remotion/transitions','@remotion/paths','@remotion/shapes','@remotion/noise','@remotion/lottie','@remotion/media-utils','@remotion/layout-utils','@remotion/three','@react-three/fiber','three'];
const forbidden=new Set(['requestAnimationFrame','setTimeout','setInterval','Date','fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','eval','Function','require','process','global','globalThis','window','document','navigator','location','localStorage','sessionStorage','useFrame','performance','crypto','importScripts']);
/** Static defense in depth. OS containment remains mandatory for agent output. */
export function lintComposition(source:string,file='Composition.tsx'){
 const issues:string[]=[];if(file.endsWith('.css')&&/(animation|transition)\s*:|@import|https?:/i.test(source))issues.push('Nondeterministic or network CSS');const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=(n:ts.Node)=>{
  if(ts.isIdentifier(n)&&forbidden.has(n.text))issues.push(`Forbidden API: ${n.text}`);
  if(ts.isPropertyAccessExpression(n)&&n.expression.getText(tree)==='Math'&&n.name.text==='random')issues.push('Use Remotion random(seed)');
  if(ts.isElementAccessExpression(n)&&['Math','window','globalThis'].includes(n.expression.getText(tree)))issues.push('Computed global access is forbidden');
  if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)){
   const m=n.moduleSpecifier;if(m&&ts.isStringLiteral(m)){const id=m.text;if(id.split('/').includes('..')&&!id.startsWith('./'))issues.push('Import traversal is forbidden');if(/^\.\/(bundle|renders|snapshots|\.tmp|\.reports)(\/|$)/.test(id))issues.push('Import of runtime state is forbidden');if(!(modules.some(p=>id===p||id.startsWith(p+'/'))||/^\.\/[\w./-]+$/.test(id)&&!id.includes('..')))issues.push(`Import outside workspace: ${id}`);}
  }
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&((n.expression.expression.getText(tree)==='gsap'&&['to','from','fromTo','delayedCall','timeline','quickTo'].includes(n.expression.name.text))||n.expression.getText(tree).startsWith('gsap.ticker.')||n.expression.getText(tree)==='gsap.utils.random'))issues.push('Use the provided paused useGsapTimeline hook and seeded randomness');
  if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword)issues.push('Dynamic imports are forbidden');
  if(ts.isStringLiteralLike(n)&&/(?:\banimation(?:-name)?\s*:|\btransition\s*:|https?:\/\/|@import|javascript:)/i.test(n.text))issues.push('Network or nondeterministic CSS');
  if(ts.isPropertyAssignment(n)&&/^(animation|animationName|transition|transitionProperty)$/.test(n.name.getText(tree).replace(/['"]/g,'')))issues.push('CSS animations/transitions are forbidden');
  if(ts.isPropertyAccessExpression(n)&&['constructor','__proto__'].includes(n.name.text))issues.push('Prototype escape');
  ts.forEachChild(n,visit);
 };visit(tree);return [...new Set(issues)];
}
export async function confinedPath(folder:string,name:string){
 if(isAbsolute(name)||name.split(/[\\/]/).includes('..')||name.includes('\0'))throw new Error('WORKSPACE_PATH_REJECTED');
 const root=await realpath(folder),target=resolve(root,name);if(!relative(root,target)||relative(root,target).startsWith('..'))throw new Error('WORKSPACE_PATH_REJECTED');
 let p=dirname(target);while(p!==root){try{if((await lstat(p)).isSymbolicLink())throw new Error('WORKSPACE_SYMLINK_REJECTED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}p=dirname(p);}
 try{if((await lstat(target)).isSymbolicLink())throw new Error('WORKSPACE_SYMLINK_REJECTED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 return target;
}
export async function writeSource(folder:string,name:string,source:string){
 const path=await confinedPath(folder,name),key=relative(await realpath(folder),path).split('\\').join('/');
 if(!['.ts','.tsx','.css','.json'].includes(extname(key))||['entry.tsx','brand.ts','resources.ts','runtime.ts','tsconfig.json','input.json','catalog.json','toolchain.json','draft.json'].includes(key)||['public','bundle','renders','snapshots','.tmp','.reports'].includes(key.split('/')[0]))throw new Error('WORKSPACE_FILE_REJECTED');
 if(Buffer.byteLength(source)>limits.maxSourceBytes)throw new Error('SOURCE_TOO_LARGE');
 await mkdir(dirname(path),{recursive:true});await writeFile(path,source);
}
export async function lintWorkspace(folder:string){
 const issues:string[]=[];let count=0;
 async function walk(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){if(['bundle','renders','snapshots','public','.tmp','.reports'].includes(e.name))continue;if(e.isSymbolicLink())throw new Error('WORKSPACE_SYMLINK_REJECTED');const path=resolve(dir,e.name);if(e.isDirectory())await walk(path);else{if(++count>limits.maxFiles)throw new Error('WORKSPACE_FILE_LIMIT');if(dir===folder&&['brand.ts','resources.ts','entry.tsx','runtime.ts','tsconfig.json'].includes(e.name))continue;const source=await readFile(path,'utf8');if(Buffer.byteLength(source)>limits.maxSourceBytes)throw new Error('SOURCE_TOO_LARGE');if(e.name.endsWith('.json'))continue;const draft=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8').catch(()=>'{}')).stage==='draft';issues.push(...(draft?lintStaticComposition(source,e.name):lintComposition(source,e.name)).map(i=>`${relative(folder,path)}: ${i}`));}}}await walk(folder);return issues;
}

/** Draft policy applies to every agent source and import, including aliases and namespace imports. */
export function lintStaticComposition(source:string,file='Frame.tsx'){
 const issues=lintComposition(source,file),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(/@keyframes\b/i.test(source))issues.push('CSS key frames are unavailable in static drafts');
 const runtimeAliases=new Set(['React','remotion']);ts.forEachChild(tree,n=>{if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&['react','remotion'].includes(n.moduleSpecifier.text)){if(n.importClause?.name)runtimeAliases.add(n.importClause.name.text);if(n.importClause?.namedBindings&&ts.isNamespaceImport(n.importClause.namedBindings))runtimeAliases.add(n.importClause.namedBindings.name.text);}});
 const blocked=new Set(['Freeze','Loop','useCurrentFrame','useGsapTimeline','interpolate','interpolateColors','spring','Sequence','Series','Video','OffthreadVideo','Audio','AnimatedImage','Lottie','ThreeCanvas','useFrame','useEffect','useLayoutEffect','useState','useReducer','gsap']);
 const visit=(n:ts.Node)=>{if(ts.isIdentifier(n)&&blocked.has(n.text))issues.push(`Animation API is unavailable in static drafts: ${n.text}`);
 if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){const id=n.moduleSpecifier.text;if(/^(gsap|three|@react-three|@remotion\/(three|transitions|media|lottie|noise))([/]|$)/.test(id)||/^\.\/runtime(?:\.|$)/.test(id))issues.push('Motion libraries are unavailable in static drafts');if(ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamespaceImport(n.importClause.namedBindings)&&id==='remotion')issues.push('Use named static Remotion imports');}
 if(ts.isElementAccessExpression(n)&&(runtimeAliases.has(n.expression.getText(tree))||ts.isStringLiteral(n.argumentExpression)&&blocked.has(n.argumentExpression.text)))issues.push('Computed runtime API access is unavailable in static drafts');if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){if(['animate','animateTransform','animateMotion','set','video','audio','iframe','object','embed'].includes(n.tagName.getText(tree)))issues.push('Animated or active media is unavailable in static drafts');}ts.forEachChild(n,visit);};visit(tree);return [...new Set(issues)];
}
