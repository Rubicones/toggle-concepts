export type AuthoredFile={path:string;source:string};
export type SourceEdit={path:string;oldText:string;newText:string};

const cleanPath=(p:string)=>p.trim().replace(/^\.\//,'');
/** Apply coder-authored exact replacements. No fuzzy matching or application layout decisions. */
export function applySourceEdits(files:AuthoredFile[],edits:SourceEdit[]):AuthoredFile[]{
 const source=new Map(files.map(file=>[cleanPath(file.path),file.source])),changed=new Map<string,string>();
 for(const rawEdit of edits){
  const path=cleanPath(rawEdit.path),current=changed.get(path)??source.get(path);
  if(current===undefined)throw new Error(`EDIT_FILE_NOT_FOUND: ${rawEdit.path}. Edit an existing authored file; use files only for a required new module.`);
  if(!rawEdit.oldText||rawEdit.oldText===rawEdit.newText)throw new Error(`EDIT_NO_CHANGE: ${rawEdit.path}. Supply a nonempty exact anchor and a real correction.`);
  const useCrLf=!current.includes(rawEdit.oldText)&&current.includes('\r\n')&&!rawEdit.oldText.includes('\r\n');
  const useLf=!current.includes(rawEdit.oldText)&&!useCrLf&&rawEdit.oldText.includes('\r\n')&&!current.includes('\r\n');
  const oldText=useCrLf?rawEdit.oldText.replace(/\n/g,'\r\n'):useLf?rawEdit.oldText.replace(/\r\n/g,'\n'):rawEdit.oldText;
  const newText=useCrLf?rawEdit.newText.replace(/\r?\n/g,'\r\n'):useLf?rawEdit.newText.replace(/\r\n/g,'\n'):rawEdit.newText;
  const index=current.indexOf(oldText);
  if(index<0||current.indexOf(oldText,index+1)>=0)throw new Error(`EDIT_ANCHOR_NOT_UNIQUE: ${rawEdit.path}. Use an exact, unique excerpt from currentFiles; nothing was written.`);
  changed.set(path,current.slice(0,index)+newText+current.slice(index+oldText.length));
 }
 return [...changed].map(([path,source])=>({path,source}));
}
