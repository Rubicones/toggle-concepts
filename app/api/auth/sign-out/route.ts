import { api,sameOrigin,json } from "@/lib/server/api";
import {sessionClient} from "@/lib/supabase/server";
export async function POST(request:Request){return api(async()=>{sameOrigin(request);const client=await sessionClient();await client.auth.signOut({scope:"local"});return json({destination:"/login"});});}
