// Isolated compiler qualification inputs only. Never seeded into the product.
import {randomUUID} from "node:crypto";
import {lumaScope,lumaManifest} from "./campaign";
import {completeBrandDraft} from "./brand";
import {draftRecipes,type DraftPlan,type DraftSource} from "../packages/contracts/drafts";
import type {DraftContext} from "../packages/creative/compiler";
export function compilerFixture(scope=lumaScope,manifest=lumaManifest){
 const hero=randomUUID(),logo=randomUUID();const assets:DraftSource[]=[hero,logo].map((id,i)=>({id,mime:"image/png",sha256:"a".repeat(64),bytes:100,filename:i?"test-logo.png":"test-product.png",inspection:{width:640,height:360}}));
 const plan:DraftPlan={schemaVersion:"1.0",fontFamily:"Noto Sans",assetUseConfirmed:true,mandatoryLegal:"",directions:draftRecipes.map((recipe,i)=>{
  const groups=new Map<string,typeof manifest.entries>();for(const row of manifest.entries){const key=JSON.stringify([row.locale,row.hook,row.beatSequence,row.offer]);groups.set(key,[...(groups.get(key)??[]),row]);}
  return {id:randomUUID(),title:["Light for focus","A calmer corner","Everyday ritual"][i],idea:["A useful desk companion","Build a comfortable room","An everyday product demonstration"][i],recipe,bindings:[...groups.values()].map(rows=>({id:randomUUID(),variantIds:rows.map(r=>r.id),locale:rows[0].locale,hook:rows[0].locale.startsWith("ru")?["Свет для важных дел","Больше света для вашего пространства","Начните вечер со света"][i]+(rows[0].hook===scope.hooks[0]?"":"." ):["Light for what matters","Make room for a brighter day","Your evening, illuminated"][i]+(rows[0].hook===scope.hooks[0]?"":"."),proof:rows[0].locale.startsWith("ru")?"Посмотрите на свет в привычном пространстве.":"Explore the light in your everyday space.",cta:rows[0].locale.startsWith("ru")?"Посмотреть коллекцию":"Explore the collection",legal:"",sequence:rows[0].beatSequence===scope.beatSequences[0]?["hook","proof","cta"]:["proof","hook","cta"],beatWeights:[1,1,1],heroAssetId:hero,logoAssetId:logo,audioAssetId:null,resource:null}))};})};
 const context:DraftContext={scope,manifest,brand:{id:randomUUID(),kit:completeBrandDraft(scope.locales)},scriptRevisionId:"script-qualification",assets};return {plan,context};
}
