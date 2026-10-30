// Validate the browser Origin against the actual Host authority. Next.js can use
// localhost in Request.url even when the request arrived via 127.0.0.1.
export function allowedOrigin(origin:string|null,host:string,applicationUrl:string):boolean {
  if(!origin)return false;
  try {
    const source=new URL(origin),configured=new URL(applicationUrl);
    if(!["http:","https:"].includes(source.protocol) || source.origin!==origin || source.host!==host.toLowerCase())return false;
    if(source.origin===configured.origin)return true;
    const local=["localhost","127.0.0.1","[::1]"];
    return local.includes(configured.hostname) && local.includes(source.hostname) && source.protocol==="http:" && ["3000","3100"].includes(source.port);
  }catch{return false;}
}
