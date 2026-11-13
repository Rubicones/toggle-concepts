"use client";
// Chat-shaped plan C10: the owner compares a first-attempt chat result with a pipeline run of the same brief. The
// pictures of each pair are labelled A and B in an order drawn when the pair is added; which is which shows only after
// every pair is judged. The run's numbers per stage sit next to the verdicts.
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Disclosure} from "@/components/ui/disclosure";
import {studioRequest,useShared} from "@/lib/shared-http";
import {BRIEF_KINDS,type ComparisonView,type Frame,type RunReport,type Verdict} from "@/packages/agents/comparison";
import styles from "./chat-comparison.module.css";

type Run={id:string;name:string;created_at:string};
type Data={schemaReady:boolean;comparisons:ComparisonView[];runs:Run[]};
const k=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${Math.round(n/1000)}k`:String(n);
const minutes=(ms:number)=>ms>=60000?`${Math.round(ms/60000)} min`:`${Math.round(ms/1000)} s`;
const sideName=(s?:string)=>s==="chat"?"the chat":"the pipeline";

/** The how-to, in plain Russian: what to prepare, what to run and how to judge. */
function HowTo(){
 return <section className={`detail-panel ${styles.howto}`} lang="ru" aria-label="Как сравнить">
  <h2>Как сравнить чат и студию</h2>
  <ol>
   <li><strong>Три брифа.</strong> Возьмите три разных бренда: сдержанный (спокойный, строгий стиль), продуктовый (главное — сам товар) и цифровой интерфейс (приложение или сервис на экране).</li>
   <li><strong>Обычный чат с Claude.</strong> Дайте тот же бриф и те же материалы бренда (логотип, цвета, шрифты, фото) и попросите рекламный кадр. Берите только первую попытку, ничего не исправляйте. Сохраните картинку. Если чат показывает, сколько токенов ушло, запишите число.</li>
   <li><strong>Студия.</strong> Запустите тот же бриф в локальном режиме с общим контекстом (Shared Local), дизайнер версии 4. Тоже только первая попытка, без правок.</li>
   <li><strong>Здесь.</strong> Создайте сравнение и выберите прогон. Добавьте пару: картинка из чата и кадр прогона (главный кадр; другие сцены, если они есть, — каждой своей парой).</li>
   <li><strong>Оценка.</strong> В каждой паре A и B стоят в случайном порядке. Выберите, что лучше как реклама этого бренда: сразу понятно, что предлагают; бренд узнаётся; текст читается; хочется нажать. Можно оставить короткую заметку. Когда все пары оценены, нажмите «Show which is which», чтобы увидеть, где был чат, а где студия.</li>
  </ol>
  <p className="muted">Цифры прогона (запросы, время, токены, доля из кэша) показаны рядом с оценками. «≈ $» — расход подписки по ценам API, а не потраченные деньги.</p>
 </section>;
}

export function ComparisonPage(){
 const {data,error,refresh}=useShared<Data>("/api/studio/comparisons",{live:false});const [message,setMessage]=useState("");
 return <><div className="page-heading"><div><p className="eyebrow">MEASURED COMPARISON</p><h1>Chat vs. studio</h1><p>Judge a first-attempt chat result against a pipeline run of the same brief, without knowing which is which.</p></div><Button variant="outline" onClick={refresh}>Refresh</Button></div>
  <HowTo/>
  {error&&<p role="alert">{error}</p>}
  {data&&!data.schemaReady&&<p className="notice" role="status">Update needed: apply migration <code>20261113000400_chat_comparisons.sql</code> in Supabase, then refresh this page.</p>}
  {data?.schemaReady&&<NewComparison runs={data.runs} done={()=>{setMessage("Comparison created. Add its first pair below.");refresh();}} fail={setMessage}/>}
  <p role="status">{message}</p>
  {data?.schemaReady&&data.comparisons.map(c=><ComparisonCard key={c.id} comparison={c} run={data.runs.find(r=>r.id===c.runId)} changed={refresh}/>)}
 </>;
}

function NewComparison({runs,done,fail}:{runs:Run[];done:()=>void;fail:(m:string)=>void}){
 const [busy,setBusy]=useState(false);
 return <section className="detail-panel" aria-label="New comparison"><h2>New comparison</h2>
  <form className="studio-form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),tokens=String(f.get("chatTokens")??"").trim();setBusy(true);
   try{await studioRequest("/api/studio/comparisons","POST",{action:"create",title:String(f.get("title")),briefKind:String(f.get("briefKind")),runId:String(f.get("runId")),chatTokens:tokens?Number(tokens):null});form.reset();done();}
   catch(error){fail(error instanceof Error?error.message:"The comparison could not be created.");}finally{setBusy(false);}}}>
   <div className="shared-form-row">
    <label>Name<input name="title" required maxLength={120} placeholder="For example: desk lamp, product brand"/></label>
    <label>Kind of brief<Select name="briefKind" required defaultValue="">{[<option key="" value="" disabled>Choose</option>,...BRIEF_KINDS.map(b=><option key={b.id} value={b.id}>{b.label}</option>)]}</Select></label>
   </div>
   <div className="shared-form-row">
    <label>Pipeline run<Select name="runId" required defaultValue=""><option value="" disabled>Choose a run</option>{runs.map(r=><option key={r.id} value={r.id}>{r.name} · {new Date(r.created_at).toLocaleDateString("en-GB")}</option>)}</Select></label>
    <label>Chat tokens (optional)<input name="chatTokens" type="number" min={0} max={100000000} step={1} placeholder="If the chat showed it"/></label>
   </div>
   <Button type="submit" disabled={busy}>Create comparison</Button>
  </form>
 </section>;
}

function ComparisonCard({comparison:c,run,changed}:{comparison:ComparisonView;run?:Run;changed:()=>void}){
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const act=async(payload:Record<string,unknown>,ok:string)=>{setBusy(true);try{await studioRequest("/api/studio/comparisons","POST",{comparisonId:c.id,...payload});setMessage(ok);changed();}catch(error){setMessage(error instanceof Error?error.message:"That did not work. Try again.");}finally{setBusy(false);}};
 const judged=c.pairs.filter(p=>p.verdict).length;
 return <section className="detail-panel" aria-label={c.title}>
  <h2>{c.title}</h2>
  <p className="muted">{BRIEF_KINDS.find(b=>b.id===c.briefKind)?.label} · run {run?.name??"not found"}{c.chatTokens!==null?` · chat used ${k(c.chatTokens)} tokens`:""} · {judged} of {c.pairs.length} pair{c.pairs.length===1?"":"s"} judged</p>
  {c.score&&<p className={styles.score}><strong>Result:</strong> the pipeline was better in {c.score.pipeline} pair{c.score.pipeline===1?"":"s"}, the chat in {c.score.chat}{c.score.same?`, about the same in ${c.score.same}`:""}.</p>}
  {c.pairs.map(p=><article key={p.id} className={styles.pair} aria-label={p.label}>
   <h3>{p.position}. {p.label}</h3>
   <div className={styles.pictures}>{(["A","B"] as const).map(label=><figure key={label} className={p.verdict===label?styles.chosen:undefined}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/api/studio/comparisons?comparison=${c.id}&pair=${p.id}&label=${label}`} alt={`Picture ${label}`} loading="lazy"/>
    <figcaption>{label}{c.revealed?` — ${sideName(p[label])}`:""}</figcaption></figure>)}</div>
   {c.revealed?<p>{p.verdict==="same"?"You judged them about the same.":p.verdict?`You chose ${p.verdict}: ${sideName(p.winner)}.`:"Not judged."}{p.note?` Note: ${p.note}`:""}</p>
    :<Judge pair={p} busy={busy} judge={(verdict,note)=>act({action:"judge",pairId:p.id,verdict,note},"Saved.")}/>}
  </article>)}
  {!c.revealed&&<AddPair comparisonId={c.id} runId={c.runId} added={()=>{setMessage("Pair added.");changed();}} fail={setMessage}/>}
  {c.canReveal&&<Button disabled={busy} onClick={()=>void act({action:"reveal"},"Revealed.")}>Show which is which</Button>}
  <p role="status">{message}</p>
  <RunNumbers runId={c.runId} chatTokens={c.chatTokens}/>
 </section>;
}

function Judge({pair,busy,judge}:{pair:ComparisonView["pairs"][number];busy:boolean;judge:(v:Verdict,note:string)=>void}){
 const [note,setNote]=useState(pair.note??"");
 return <div className={styles.judge}>
  <div className="data-heading-actions">{(["A","B","same"] as const).map(v=><Button key={v} variant={pair.verdict===v?"default":"outline"} disabled={busy} onClick={()=>judge(v,note)}>{v==="same"?"About the same":`${v} is better`}</Button>)}</div>
  <label>Note (optional)<textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.currentTarget.value)} placeholder="What made the difference"/></label>
 </div>;
}

function AddPair({comparisonId,runId,added,fail}:{comparisonId:string;runId:string;added:()=>void;fail:(m:string)=>void}){
 const frames=useShared<{frames:Frame[]}>(`/api/studio/comparisons?frames=${runId}`,{live:false}),list=frames.data?.frames??[];const [busy,setBusy]=useState(false);
 if(frames.data&&!list.length)return <p className="notice">This run has no saved frames yet. Pairs can be added once its draft has a hero frame.</p>;
 return <form className={`studio-form ${styles.add}`} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),picture=f.get("picture"),frame=list.find(x=>x.eventId===f.get("pipelineEventId"));
  if(!(picture instanceof File)||!picture.size){fail("Choose the chat picture first.");return;}
  f.set("comparisonId",comparisonId);f.set("label",String(f.get("label")||frame?.label||"Hero frame"));setBusy(true);
  try{await studioRequest("/api/studio/comparisons","POST",f);form.reset();added();}catch(error){fail(error instanceof Error?error.message:"The pair could not be added.");}finally{setBusy(false);}}}>
  <h3>Add a pair</h3>
  <div className="shared-form-row">
   <label>Chat picture<input name="picture" type="file" accept="image/png,image/jpeg,image/webp" required/></label>
   <label>Frame of the run<Select name="pipelineEventId" required defaultValue={list[0]?.eventId??""}>{list.map(f=><option key={f.eventId} value={f.eventId}>{f.label}</option>)}</Select></label>
  </div>
  <label>Name of the pair (optional)<input name="label" maxLength={80} placeholder="Taken from the frame, for example Hero frame"/></label>
  <Button type="submit" disabled={busy||!list.length}>Add pair</Button>
 </form>;
}

/** The run's numbers per stage and in total, next to the verdicts. */
function RunNumbers({runId,chatTokens}:{runId:string;chatTokens:number|null}){
 const {data}=useShared<RunReport&{criticLine?:string}>(`/api/studio/comparisons?report=${runId}`,{live:false});
 if(!data)return null;
 const t=data.total,row=(s:RunReport["stages"][number],wall?:number)=><tr key={s.stage}><th scope="row">{s.label}</th><td>{s.totals.calls}</td><td>{s.turns}</td><td>{minutes(wall??s.timeMs)}</td><td>{k(s.totals.input)}</td><td>{k(s.totals.cacheRead)}</td><td>{k(s.totals.cacheCreation)}</td><td>{k(s.totals.output)}</td><td>${s.totals.apiEquivalentUsd.toFixed(2)}</td><td>{Math.round(s.totals.cachedShare*100)}%</td></tr>;
 return <Disclosure><summary>The run in numbers: {t.totals.calls} requests · {minutes(t.wallMs)} · {k(t.totals.input+t.totals.cacheCreation+t.totals.cacheRead)} in, {Math.round(t.totals.cachedShare*100)}% from the cache · {k(t.totals.output)} out{chatTokens!==null?` (the chat: ${k(chatTokens)} tokens)`:""}</summary>
  <div className={styles.table}><table><thead><tr><th scope="col">Stage</th><th scope="col">Requests</th><th scope="col">Turns</th><th scope="col">Time</th><th scope="col">Input</th><th scope="col">Cache read</th><th scope="col">Cache write</th><th scope="col">Output</th><th scope="col">≈ API price</th><th scope="col">Cached share</th></tr></thead>
   <tbody>{data.stages.map(s=>row(s))}{row(t,t.wallMs)}</tbody></table></div>
  {data.cacheLine&&<p className="muted">{data.cacheLine}</p>}
  {data.criticLine&&<p className="muted">{data.criticLine}</p>}
  <p className="muted">{data.repair.answers?`Planning answers written as text: ${data.repair.answers}; ${data.repair.repaired} needed a second try to fit their format (${Math.round((data.repair.share??0)*100)}%)${data.repair.notFitting?`, ${data.repair.notFitting} still did not fit`:""}.`:"This run has no planning answers written as text (it started before that change)."}</p>
  <p className="muted">Time per stage is the time its requests took; the total is from the first request to the end of the last. ≈ API price is the subscription quota at API prices, not money spent.</p>
 </Disclosure>;
}
