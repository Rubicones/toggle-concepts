import ts from 'typescript';
import {issuedScenes} from './scenes';
import type {DirectionInput} from './types';
import type {LiveOptions} from './live-preview';
import {readyLiveVariants} from './live-preview';
/** Read static declarations, never execute agent code to discover readiness. */
export function readLiveOptions(source:string,input:DirectionInput):{options:LiveOptions;legacy:boolean}{
 const tree=ts.createSourceFile('Frame.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let value:ts.Expression|undefined;
 for(const node of tree.statements)if(ts.isVariableStatement(node)&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))for(const d of node.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.name.text==='previewOptions')value=d.initializer;
 const first=input.variants[0],defaults:LiveOptions={hooks:first?[first.hook]:[],ctas:first?[first.cta]:[],locales:first?[first.locale]:[],lengths:first?[first.length]:[],scenes:input.storyboard.map(s=>s.id),adaptive:false};
 if(!value)return {options:{hooks:[...new Set(input.variants.map(v=>v.hook))],ctas:[...new Set(input.variants.map(v=>v.cta))],locales:[...new Set(input.variants.map(v=>v.locale))],lengths:[...new Set(input.variants.map(v=>v.length))],scenes:defaults.scenes,adaptive:false},legacy:true};
 const constants=new Map<string,ts.Expression>();
 for(const statement of tree.statements)if(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const))for(const d of statement.declarationList.declarations)if(ts.isIdentifier(d.name)&&d.initializer)constants.set(d.name.text,d.initializer);
 let remaining=4096;const resolving=new Set<string>();
 const literal=(node:ts.Expression,depth=0):unknown=>{
  if(--remaining<0||depth>64)throw new Error('PREVIEW_OPTIONS_MUST_BE_LITERAL: Static declaration exceeds the reader limit.');
  if(ts.isAsExpression(node)||ts.isSatisfiesExpression(node)||ts.isParenthesizedExpression(node))return literal(node.expression,depth+1);
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isNumericLiteral(node))return ts.isNumericLiteral(node)?Number(node.text):node.text;
  if(node.kind===ts.SyntaxKind.TrueKeyword)return true;if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
  if(ts.isIdentifier(node)){
   const initializer=constants.get(node.text);if(!initializer||resolving.has(node.text))throw new Error(`PREVIEW_OPTIONS_MUST_BE_LITERAL: ${node.text} must reference a module const containing a literal value.`);
   resolving.add(node.text);let resolved:unknown;try{resolved=literal(initializer,depth+1);}finally{resolving.delete(node.text);}
   if(!['string','number','boolean','object'].includes(typeof resolved)||resolved===null)throw new Error('PREVIEW_OPTIONS_MUST_BE_LITERAL: Only literal const aliases are supported.');return resolved;
  }
  if(ts.isArrayLiteralExpression(node))return node.elements.map(n=>literal(n as ts.Expression,depth+1));
  if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(p=>{if(!ts.isPropertyAssignment(p)||!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name))throw new Error('PREVIEW_OPTIONS_MUST_BE_LITERAL');return [p.name.text,literal(p.initializer,depth+1)];}));
  throw new Error('PREVIEW_OPTIONS_MUST_BE_LITERAL: Use literal values or module const scalar aliases; computed expressions and function calls are not supported.');
 };
 const declared=literal(value) as Record<string,unknown>,options={...defaults};
 if(!declared||Array.isArray(declared)||typeof declared!=='object')throw new Error('PREVIEW_OPTIONS_MUST_BE_LITERAL');
 if(['hooks','ctas','locales','lengths','scenes','adaptive'].some(key=>!(key in declared)))throw new Error('PREVIEW_OPTIONS_FIELDS_REQUIRED');
 for(const [key,axis]of [['hooks','hook'],['ctas','cta'],['locales','locale'],['lengths','length']] as const){const rawRows=declared[key]??defaults[key],allowed=new Set<string|number>(input.variants.map(v=>v[axis])),rows=Array.isArray(rawRows)?rawRows.map(v=>key==='lengths'&&typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v.trim())&&allowed.has(Number(v.trim()))?Number(v.trim()):v):rawRows;if(!Array.isArray(rows)||rows.some(v=>typeof v!=='string'&&typeof v!=='number'||!allowed.has(v)))throw new Error('UNISSUED_PREVIEW_OPTION');(options[key] as (string|number)[])= [...new Set(rows)] as (string|number)[];}
 if(declared.scenes!==undefined){const issued=issuedScenes(input),resolveScene=(id:unknown)=>{if(typeof id!=='string')return undefined;if(issued.some(scene=>scene.id===id))return id;const bySource=issued.filter(scene=>scene.sourceSceneId===id);return bySource.length===1?bySource[0].id:undefined;};if(!Array.isArray(declared.scenes))throw new Error('UNISSUED_PREVIEW_OPTION');const resolved=declared.scenes.map(resolveScene);if(resolved.some(id=>!id))throw new Error('UNISSUED_PREVIEW_OPTION');options.scenes=[...new Set(resolved as string[])];}
 if(declared.adaptive!==undefined&&typeof declared.adaptive!=='boolean')throw new Error('INVALID_PREVIEW_ADAPTIVENESS');options.adaptive=declared.adaptive===true;
 if(declared.labels!==undefined){if(!declared.labels||Array.isArray(declared.labels)||typeof declared.labels!=='object')throw new Error('INVALID_PREVIEW_LABELS');const labels:NonNullable<LiveOptions['labels']>={};for(const key of ['hooks','ctas','locales','lengths','scenes'] as const){const group=(declared.labels as Record<string,unknown>)[key];if(group===undefined)continue;if(!group||Array.isArray(group)||typeof group!=='object')throw new Error('INVALID_PREVIEW_LABELS');labels[key]=Object.fromEntries(Object.entries(group).map(([id,label])=>{if(!options[key].some(v=>String(v)===id)||typeof label!=='string'||!label.trim()||label.length>80)throw new Error('INVALID_PREVIEW_LABELS');return [id,label];}));}options.labels=labels;}
 if(!options.scenes.length||!readyLiveVariants(input.variants,options).length)throw new Error('PREVIEW_OPTIONS_NOT_READY: Publish at least one issued copy combination and scene.');
 return {options,legacy:false};
}
