/** Keep the frozen media type: SVG images cannot decode from an untyped blob. */
export async function previewMediaBlob(bytes:ArrayBuffer,resource:{mime:string;sha256:string}):Promise<Blob>{
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(digest!==resource.sha256)throw new Error('Media bytes do not match this revision.');
 return new Blob([bytes],{type:resource.mime});
}
