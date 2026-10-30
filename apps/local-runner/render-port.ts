import {createServer,type AddressInfo} from 'node:net';
/** Keep rendering separate from an already-running studio preview. */
export async function availableRenderPort(){
 const server=createServer();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=(server.address() as AddressInfo).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;
}
