import type {DirectorEvent} from './events';
export type ActivityPosition={at:string;id:string};
export type ActivityCursor={events:ActivityPosition|null;decisions:ActivityPosition|null};
export type DirectorActivityPage={events:DirectorEvent[];next:ActivityCursor|null};

export function compareDirectorEvents(a:DirectorEvent,b:DirectorEvent){
 // PostgreSQL timestamps retain microseconds; Date.parse alone collapses those
 // transitions into one millisecond and can put a running event after its receipt.
 return Date.parse(a.at)-Date.parse(b.at)||(a.at.match(/\.(\d+)/)?.[1]??'').padEnd(9,'0').localeCompare((b.at.match(/\.(\d+)/)?.[1]??'').padEnd(9,'0'))||a.id.localeCompare(b.id);
}
export function mergeDirectorEvents(...pages:DirectorEvent[][]):DirectorEvent[]{
 return [...new Map(pages.flat().map(event=>[event.id,event])).values()].sort(compareDirectorEvents);
}
