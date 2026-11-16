// "New run with the same brief" (lib/server/new-run.ts): naming only. Pure.
/** The new campaign's name: the earlier name without an earlier run mark, with the next number. */
export function nextRunName(name:string,existing:string[]):string{
 const base=name.replace(/\s+·\s+run\s+\d+$/i,'').trim().slice(0,68),taken=new Set(existing.map(n=>n.trim().toLowerCase()));
 for(let n=2;n<1000;n++){const candidate=`${base} · run ${n}`;if(!taken.has(candidate.toLowerCase()))return candidate;}
 return `${base} · run`;
}
