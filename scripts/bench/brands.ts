// Bench brands: three invented brands from different categories, each with its own character, type and palette.
// They exist to check that drafts follow a brand and do not converge on one look. Not real companies.
import type {DirectionInput} from '../../packages/director/types';

type Lines=Record<string,string[]>; // locale → lines
type Scene={id:string;notes:string;copy:Record<string,Lines>}; // hook → locale → lines
export type BenchBrand={
 id:string;name:string;category:string;
 /** System font files copied into the workspace as the brand's own. */
 fonts:{family:string;file:string;weight:string;source:string;style?:'italic'}[];
 logoSvg:string;
 tokens:Record<string,string|number>;
 /** The brand as a character: what a brand-character step would write down once per run. */
 character:string;
 product:string;offer:string;audience:string;
 hooks:Record<string,string>; // hook id → what it is about
 cta:Lines;
 scenes:Scene[];
 /** Mode "client gave the words": the visual idea is the designer's. Mode "propose": this idea came with the hooks. */
 idea?:string;
};

const LOCALES=['en-GB','de-DE','tr-TR'],FORMATS=[['square',1080,1080],['vertical',1080,1920],['portrait',1080,1350],['wide',1920,1080]] as const;

export const brands:BenchBrand[]=[
 {id:'pallet',name:'Pallet',category:'B2B software: dock scheduling for warehouses',
  fonts:[{family:'Pallet Mono',file:'pallet-mono-bold.ttf',weight:'700',source:'/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'},{family:'Pallet Mono',file:'pallet-mono-regular.ttf',weight:'400',source:'/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 120"><rect x="0" y="20" width="80" height="80" fill="currentColor"/><rect x="16" y="36" width="48" height="12" fill="#FFD400"/><rect x="16" y="54" width="48" height="12" fill="#FFD400"/><rect x="16" y="72" width="48" height="12" fill="#FFD400"/><text x="104" y="92" font-family="JetBrains Mono" font-weight="700" font-size="88" fill="currentColor" letter-spacing="-2">PALLET</text></svg>`,
  tokens:{'colour.ground':'#16181B','colour.signal':'#FFD400','colour.paper':'#F2F0EA','colour.steel':'#8A9099','type.headline':'Pallet Mono 700, upper case, tight leading','type.body':'Pallet Mono 400','voice.tone':'Dry, exact, counts things. Speaks like a dispatcher: times, docks, minutes. No exclamation marks.','graphic.gesture':'Dock-door numbers, lane stripes, time slots as blocks on a grid; yellow is a signal, used on one thing at a time.','logo.clearSpacePx':'24'},
  character:'Temperament: exact, unhurried, slightly deadpan. Signature: near-black ground, one signal-yellow element, monospaced upper-case type, numbers treated as heroes, lane stripes and time-slot blocks. Proportions: 80% dark ground, 15% paper-white type, 5% yellow. Speech: short, counted, dispatcher-like; never salesy. Substance: the dock schedule itself (doors, slots, trucks, minutes saved).',
  product:'Pallet books trucks into dock doors by the minute, so drivers stop queueing at the gate. Dispatchers see every door and every slot on one board.',
  offer:'First warehouse free for 60 days',audience:'Warehouse and transport managers who lose hours to trucks waiting at the gate.',
  hooks:{primary:'the queue at the gate',"hook-1":'minutes counted'},
  cta:{'en-GB':['Book a demo'],'de-DE':['Demo buchen'],'tr-TR':['Demo ayırt']},
  scenes:[
   {id:'scene-1',notes:'The problem: trucks waiting.',copy:{primary:{'en-GB':['Eleven trucks.','One open door.'],'de-DE':['Elf Lkw.','Ein offenes Tor.'],'tr-TR':['On bir kamyon.','Tek açık kapı.']},'hook-1':{'en-GB':['47 minutes','at the gate. Again.'],'de-DE':['47 Minuten','am Tor. Schon wieder.'],'tr-TR':['Kapıda 47 dakika.','Yine.']}}},
   {id:'scene-2',notes:'The product as proof: the dock board with booked slots.',copy:{primary:{'en-GB':['Every truck','gets a slot.'],'de-DE':['Jeder Lkw','bekommt ein Zeitfenster.'],'tr-TR':['Her kamyona','bir saat aralığı.']},'hook-1':{'en-GB':['Door 4.','14:20. Booked.'],'de-DE':['Tor 4.','14:20. Gebucht.'],'tr-TR':['Kapı 4.','14:20. Ayrıldı.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['First warehouse','free for 60 days'],'de-DE':['Erstes Lager','60 Tage kostenlos'],'tr-TR':['İlk depo','60 gün ücretsiz']},'hook-1':{'en-GB':['First warehouse','free for 60 days'],'de-DE':['Erstes Lager','60 Tage kostenlos'],'tr-TR':['İlk depo','60 gün ücretsiz']}}},
  ]},
 {id:'mossa',name:'Mossa',category:'Consumer food: oat drink',
  fonts:[{family:'Mossa Serif',file:'mossa-serif-bold.ttf',weight:'700',source:'/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf'},{family:'Mossa Serif',file:'mossa-serif-italic.ttf',weight:'400',style:'italic',source:'/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 130"><text x="0" y="100" font-family="Caladea" font-weight="700" font-style="italic" font-size="120" fill="currentColor">mossa</text><circle cx="392" cy="34" r="16" fill="currentColor"/></svg>`,
  tokens:{'colour.cream':'#F4EBD9','colour.moss':'#3F5B3A','colour.tomato':'#E8472B','colour.oat':'#D9C3A0','type.headline':'Mossa Serif 700, sentence case, large, generous','type.aside':'Mossa Serif italic 400, for asides and jokes','voice.tone':'Warm, a little cheeky, talks like a friend at breakfast. Jokes at its own expense. Never preachy about health or the planet.','graphic.gesture':'The carton and the glass photographed in soft morning daylight on the cream ground; the tomato dot and italic asides sit on top of the photograph.','logo.clearSpacePx':'28'},
  character:'Temperament: warm, cheeky, relaxed. Signature: cream ground, big bold serif in moss green, one tomato-red dot that acts like a small character, italic asides, appetising daylight photography of the real drink. Proportions: 60% cream, 30% moss, 10% tomato. Speech: friendly, self-mocking, short jokes; never a lecture. Substance: the carton, a glass being poured, the breakfast table, the froth on a coffee.',
  product:'Mossa is an oat drink that froths like milk and does not taste of cardboard. Made in small batches, sold in a one-litre carton.',
  offer:'Two cartons for the price of one this month',audience:'People who tried oat drinks, were disappointed, and went back to milk.',
  hooks:{primary:'tastes like it should',"hook-1":'froths properly'},
  cta:{'en-GB':['Find it near you'],'de-DE':['In deiner Nähe finden'],'tr-TR':['Yakınında bul']},
  scenes:[
   {id:'scene-1',notes:'The disappointment people know.',copy:{primary:{'en-GB':['Oat drink that','doesn’t taste of box.'],'de-DE':['Haferdrink, der nicht','nach Karton schmeckt.'],'tr-TR':['Kutu tadı vermeyen','yulaf içeceği.']},'hook-1':{'en-GB':['Your flat white','called. It’s flat.'],'de-DE':['Dein Flat White','ruft an. Er ist flach.'],'tr-TR':['Flat white’ın aradı.','Hâlâ düz.']}}},
   {id:'scene-2',notes:'The product as proof: poured, frothing.',copy:{primary:{'en-GB':['Just oats.','Behaving themselves.'],'de-DE':['Nur Hafer.','Der sich benimmt.'],'tr-TR':['Sadece yulaf.','Uslu duran cinsinden.']},'hook-1':{'en-GB':['Froths like','it means it.'],'de-DE':['Schäumt, als','meinte er es ernst.'],'tr-TR':['Köpürüyor.','Hem de ciddi ciddi.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['Two cartons','for the price of one'],'de-DE':['Zwei Packungen','zum Preis von einer'],'tr-TR':['İki kutu','bir kutu fiyatına']},'hook-1':{'en-GB':['Two cartons','for the price of one'],'de-DE':['Zwei Packungen','zum Preis von einer'],'tr-TR':['İki kutu','bir kutu fiyatına']}}},
  ]},
 {id:'dvor',name:'Dvor',category:'Local service: neighbourhood bike repair',
  fonts:[{family:'Dvor Grotesk',file:'dvor-grotesk-black.otf',weight:'900',source:'/usr/share/fonts/opentype/inter/Inter-Black.otf'},{family:'Dvor Grotesk',file:'dvor-grotesk-medium.otf',weight:'500',source:'/usr/share/fonts/opentype/inter/Inter-Medium.otf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 120"><circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="14"/><circle cx="60" cy="60" r="8" fill="currentColor"/><text x="128" y="98" font-family="Inter" font-weight="900" font-size="104" fill="currentColor" letter-spacing="-4">DVOR</text></svg>`,
  tokens:{'colour.blue':'#1F3CFF','colour.white':'#FFFFFF','colour.black':'#0B0B0F','colour.tape':'#FF6A3D','type.headline':'Dvor Grotesk 900, huge, tight, lower or upper case as the line needs','type.small':'Dvor Grotesk 500','voice.tone':'Loud, street-level, honest about prices and times. Talks like the mechanic at the door. Short sentences. A bit of swagger.','graphic.gesture':'Type so big it gets cropped by the frame, hand-torn tape strips in orange with handwritten-looking prices, circles from wheels and sprockets, photos with flash.','logo.clearSpacePx':'20'},
  character:'Temperament: loud, quick, streetwise, generous. Signature: electric blue ground or full-bleed flash photo, enormous black-weight type cropped by the frame, orange tape strips carrying prices and times, wheel circles. Proportions: 55% blue, 30% white type and photo, 10% black, 5% orange tape. Speech: mechanic at the door, prices and minutes stated plainly, a little swagger. Substance: hands on a chain, a wheel in a stand, the workshop door, a fixed bike rolling out.',
  product:'Dvor is a neighbourhood bike workshop: punctures fixed while you wait, a full service by tomorrow, prices on the door.',
  offer:'Puncture fixed in 15 minutes or it’s free',audience:'City riders whose bike has been broken in the hallway for weeks.',
  hooks:{primary:'the bike in the hallway',"hook-1":'fifteen minutes'},
  cta:{'en-GB':['Roll in today'],'de-DE':['Komm heute vorbei'],'tr-TR':['Bugün uğra']},
  scenes:[
   {id:'scene-1',notes:'The bike that has been broken for weeks.',copy:{primary:{'en-GB':['Still flat?','Since March?'],'de-DE':['Immer noch platt?','Seit März?'],'tr-TR':['Hâlâ patlak mı?','Marttan beri mi?']},'hook-1':{'en-GB':['15 minutes.','We timed it.'],'de-DE':['15 Minuten.','Wir haben gestoppt.'],'tr-TR':['15 dakika.','Süre tuttuk.']}}},
   {id:'scene-2',notes:'The service as proof: hands, wheel, the fix happening.',copy:{primary:{'en-GB':['Punctures fixed','while you wait.'],'de-DE':['Platten geflickt,','während du wartest.'],'tr-TR':['Sen beklerken','patlak tamir.']},'hook-1':{'en-GB':['In. Fixed.','Out.'],'de-DE':['Rein. Geflickt.','Raus.'],'tr-TR':['Gir. Tamir.','Çık.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['15 minutes','or it’s free'],'de-DE':['15 Minuten','oder gratis'],'tr-TR':['15 dakika','yoksa bedava']},'hook-1':{'en-GB':['15 minutes','or it’s free'],'de-DE':['15 Minuten','oder gratis'],'tr-TR':['15 dakika','yoksa bedava']}}},
  ]},
];

/** The draft input the pipeline would hand the designer for this brand (designer blocks, statics, square first). */
export function benchInput(brand:BenchBrand):DirectionInput{
 const formats=FORMATS.map(([id,width,height])=>{const vertical=height/width>1.65;return {id,fps:30,width,height,minTextPx:Math.max(16,Math.round(Math.min(width,height)*32/1080)),safe:{left:width*(vertical?.06:.05),right:width*(vertical?.06:.05),top:height*(vertical?.10:.05),bottom:height*(vertical?.18:.05)}};});
 const variants=LOCALES.flatMap(locale=>Object.keys(brand.hooks).flatMap(hook=>FORMATS.map(([format])=>({id:`${format}.${locale}.${hook}`,format,locale,hook,cta:'primary',length:6}))));
 // Square, en-GB, primary first: the reference variant.
 variants.sort((a,b)=>Number(b.format==='square'&&b.locale==='en-GB'&&b.hook==='primary')-Number(a.format==='square'&&a.locale==='en-GB'&&a.hook==='primary'));
 const variantFacts=Object.fromEntries(variants.map(v=>{const sceneCopy=Object.fromEntries(brand.scenes.map(s=>[s.id,s.id===brand.scenes.at(-1)!.id?[...s.copy[v.hook][v.locale],...brand.cta[v.locale]]:s.copy[v.hook][v.locale]]));return [v.id,{sceneCopy,required:Object.values(sceneCopy).flat()}];}));
 return {protocol:'director@1',stage:'draft',runId:`bench-${brand.id}`,roundId:'round',directionId:'direction',iterationId:'iteration',
  storyboard:brand.scenes.map((s,i)=>({id:s.id,start:i*2,end:i*2+2,copy:s.copy.primary['en-GB'],visualNotes:s.notes,motionNotes:'',maxStaticSeconds:2})),
  brand:{tokens:brand.tokens,fonts:brand.fonts.map(f=>({family:f.family,url:f.file,weight:f.weight,style:f.style??'normal'})),logos:[{id:'logo',url:'logo.svg',clearSpacePx:Number(brand.tokens['logo.clearSpacePx']??24),required:true}],
   rules:{allowedFonts:[...new Set(brand.fonts.map(f=>f.family))],forbiddenColours:[],minimumContrast:4.5,logoRequired:true},copy:{cta:Object.fromEntries(LOCALES.map(l=>[l,brand.cta[l][0]]))},facts:{},references:[]},
  brief:{product:brand.product,offer:brand.offer,cta:brand.cta['en-GB'][0],audience:brand.audience,designerVersion:2,squarePreviewVersion:0,pictureRulesVersion:1,finalNotesVersion:1,promptVersion:2,synthesisAllowed:true},
  assets:[],formats,variants,resourceIds:['picture-1','picture-2','picture-3'],variantFacts} as unknown as DirectionInput;
}
