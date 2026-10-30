import {spawn} from "node:child_process";
import {readFileSync} from "node:fs";
import {parseEnv} from "node:util";
const command=process.argv[2];if(!["dev","build","start"].includes(command))throw new Error("Invalid Next command");
const config=parseEnv(readFileSync(".env.local","utf8"));
const child=spawn(process.execPath,["node_modules/next/dist/bin/next",command,...process.argv.slice(3)],{env:{...process.env,...config,STUDIO_SHARED_MODE:"true",STUDIO_LOCAL_COMPUTE:"true",STUDIO_SHARED_PREVIEW:"true",MEDIA_BACKEND:"supabase",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:3100"},stdio:"inherit"});
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>child.kill(signal));child.once("exit",code=>process.exitCode=code??1);
