import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const command=process.argv[2];
if(!["dev","build","start"].includes(command))throw new Error("Expected dev, build or start");
let local;try{local=parseEnv(readFileSync(".env.m02.local","utf8"));}catch{throw new Error("Run npm run data:start and npm run seed:demo first.");}
for(const name of ["NEXT_PUBLIC_SUPABASE_URL","LOCAL_DATABASE_URL","S3_ENDPOINT"]){if(!["localhost","127.0.0.1","[::1]"].includes(new URL(local[name]).hostname))throw new Error("Local preview refuses remote data/storage targets.");}
// Pass values through the child environment, not --env-file. Next.js forwards
// execArgv to build workers' NODE_OPTIONS, where Node 22 rejects --env-file.
const child=spawn(process.execPath,["node_modules/next/dist/bin/next",command,...process.argv.slice(3)],{env:{...process.env,...local,STUDIO_LOCAL_PREVIEW:"true",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3100"},stdio:"inherit"});
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>child.kill(signal));
child.once("error",()=>{console.error("Could not start local Next.js.");process.exitCode=1;});
child.once("exit",(code,signal)=>{process.exitCode=code ?? (signal ? 130 : 1);});
