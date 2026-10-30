export type AuthoredFile={path:string;source:string};
export type SourceEdit={path:string;oldText:string;newText:string};

/** Apply coder-authored exact replacements. No fuzzy matching or application layout decisions. */
export function applySourceEdits(files:AuthoredFile[],edits:SourceEdit[]):AuthoredFile[]{
 const source=new Map(files.map(file=>[file.path,file.source])),changed=new Map<string,string>();
 for(const edit of edits){
  const current=changed.get(edit.path)??source.get(edit.path);
  if(current===undefined)throw new Error(`EDIT_FILE_NOT_FOUND: ${edit.path}. Edit an existing authored file; use files only for a required new module.`);
  if(!edit.oldText||edit.oldText===edit.newText)throw new Error(`EDIT_NO_CHANGE: ${edit.path}. Supply a nonempty exact anchor and a real correction.`);
  const index=current.indexOf(edit.oldText);
  if(index<0||current.indexOf(edit.oldText,index+1)>=0)throw new Error(`EDIT_ANCHOR_NOT_UNIQUE: ${edit.path}. Use an exact, unique excerpt from currentFiles; nothing was written.`);
  changed.set(edit.path,current.slice(0,index)+edit.newText+current.slice(index+edit.oldText.length));
 }
 return [...changed].map(([path,source])=>({path,source}));
}
