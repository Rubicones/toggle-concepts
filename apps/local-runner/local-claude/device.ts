// The local device identity for Local mode (plan §4): one stable id per person's computer, kept outside the repository
// in ~/.toggle/device.json. Only a runner on the same user and device may claim a Local task (S3), so the id must
// survive restarts, unlike the runner's per-process lease id.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {homedir,hostname} from 'node:os';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

export type Device={id:string;label:string;createdAt:string};

export const toggleHome=()=>process.env.TOGGLE_HOME??join(homedir(),'.toggle');
export const devicePath=()=>join(toggleHome(),'device.json');

const isDevice=(v:unknown):v is Device=>!!v&&typeof v==='object'&&typeof (v as Device).id==='string'&&/^[0-9a-f-]{36}$/.test((v as Device).id)&&typeof (v as Device).label==='string';

export async function readDevice(path=devicePath()):Promise<Device|undefined>{
 try{const v=JSON.parse(await readFile(path,'utf8'));return isDevice(v)?v:undefined;}catch{return undefined;}
}

/** Reads the device, creating it on first use. The label is only for people (the computer's name); the id decides. */
export async function ensureDevice(path=devicePath(),label=hostname().replace(/\.local$/,'')):Promise<{device:Device;created:boolean}>{
 const existing=await readDevice(path);if(existing)return {device:existing,created:false};
 const device:Device={id:randomUUID(),label:label.slice(0,80)||'This computer',createdAt:new Date().toISOString()};
 await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(device,null,2)+'\n',{mode:0o600});
 return {device,created:true};
}
