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
 {id:'tono',name:'Tono',category:'Consumer electronics: a small wireless speaker',
  fonts:[{family:'Tono Display',file:'tono-light.otf',weight:'300',source:'/usr/share/fonts/opentype/inter/InterDisplay-Light.otf'},{family:'Tono Display',file:'tono-semibold.otf',weight:'600',source:'/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120"><text x="0" y="96" font-family="Inter Display" font-weight="300" font-size="110" letter-spacing="14" fill="currentColor">tono</text><circle cx="388" cy="60" r="20" fill="none" stroke="currentColor" stroke-width="6"/></svg>`,
  tokens:{'colour.night':'#0E0F12','colour.bone':'#ECE7DF','colour.ember':'#FF5A1F','colour.graphite':'#3A3D44','type.headline':'Tono Display 300, lower case, very large, airy tracking','type.small':'Tono Display 600, small caps feel, wide tracking','voice.tone':'Quiet confidence. Few words, sensory, a little dry. Never technical bragging.','graphic.gesture':'The object itself as sculpture: one sphere of sound in deep space, soft studio light, a single ember-orange glow; sound shown as rings or pressure, never as waveforms.','logo.clearSpacePx':28},
  character:'Temperament: calm, precise, sensual. Signature: near-black space, one sculptural object lit like jewellery, thin light type, a single ember-orange accent that glows. Proportions: 75% night, 20% bone type and highlights, 5% ember. Speech: few words, about what you feel, not specs. Substance: the speaker as an object (a matte sphere the size of an orange with a fabric band), the room it fills, materials: anodised metal, woven fabric, soft rubber.',
  product:'Tono is a wireless speaker the size of an orange that fills a room. One sphere, one button, twenty hours.',
  offer:'Free engraving this month',audience:'People who care how things on their shelf look and are tired of plastic gadgets.',
  hooks:{primary:'small thing, big sound',"hook-1":'an object, not a gadget'},
  cta:{'en-GB':['Hear it'],'de-DE':['Hör rein'],'tr-TR':['Dinle']},
  scenes:[
   {id:'scene-1',notes:'The surprise of scale: something this small fills the room.',copy:{primary:{'en-GB':['The size of an orange.','The sound of a room.'],'de-DE':['Groß wie eine Orange.','Klingt wie ein ganzer Raum.'],'tr-TR':['Bir portakal kadar.','Bir oda dolusu ses.']},'hook-1':{'en-GB':['Not a gadget.','An object.'],'de-DE':['Kein Gadget.','Ein Objekt.'],'tr-TR':['Cihaz değil.','Bir obje.']}}},
   {id:'scene-2',notes:'The product as proof: the object itself, close, materials.',copy:{primary:{'en-GB':['One sphere.','One button.'],'de-DE':['Eine Kugel.','Ein Knopf.'],'tr-TR':['Tek küre.','Tek düğme.']},'hook-1':{'en-GB':['Twenty hours','of quiet confidence.'],'de-DE':['Zwanzig Stunden','stille Souveränität.'],'tr-TR':['Yirmi saat','sakin özgüven.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['Free engraving','this month'],'de-DE':['Gravur gratis','in diesem Monat'],'tr-TR':['Bu ay','gravür ücretsiz']},'hook-1':{'en-GB':['Free engraving','this month'],'de-DE':['Gravur gratis','in diesem Monat'],'tr-TR':['Bu ay','gravür ücretsiz']}}},
  ]},
 {id:'fold',name:'Fold',category:'Fintech: a shared budget app for couples',
  fonts:[{family:'Fold Sans',file:'fold-bold.ttf',weight:'700',source:'/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'},{family:'Fold Sans',file:'fold-regular.ttf',weight:'400',source:'/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 120"><path d="M10 20h70l-20 40 20 40H10z" fill="currentColor"/><text x="104" y="94" font-family="Carlito" font-weight="700" font-size="100" fill="currentColor">fold</text></svg>`,
  tokens:{'colour.lilac':'#C9B8FF','colour.ink':'#1B1530','colour.lime':'#D6FF4B','colour.paper':'#FBFAFF','colour.blush':'#FFB8C9','type.headline':'Fold Sans 700, sentence case, friendly, tight','type.body':'Fold Sans 400','voice.tone':'Honest about money awkwardness, light, on the couple\'s side. Says the thing people avoid saying. No finance jargon.','graphic.gesture':'The app\'s own interface as the hero: two-person split bars, rounded cards, a receipt that folds in two; soft lilac ground with lime highlights; interface pieces enlarged like objects.','logo.clearSpacePx':24},
  character:'Temperament: warm, frank, a bit playful. Signature: lilac ground, ink type, lime as the highlight, rounded interface cards used large as the picture, a fold line that splits things in two. Proportions: 60% lilac, 25% paper cards, 10% ink, 5% lime. Speech: says the awkward money thing out loud, kindly. Substance: the app screen: a shared balance, a split bar with two names, a list of expenses with who paid, a settle-up button.',
  product:'Fold is a shared budget for couples: every expense lands in one list, split the way you agreed, and one tap settles up.',
  offer:'Free for the first three months',audience:'Couples who live together and keep a mental tally of who paid for what.',
  hooks:{primary:'who paid last time',"hook-1":'the mental tally'},
  cta:{'en-GB':['Start a shared budget'],'de-DE':['Gemeinsames Budget starten'],'tr-TR':['Ortak bütçe başlat']},
  scenes:[
   {id:'scene-1',notes:'The awkward moment everyone knows.',copy:{primary:{'en-GB':['“I paid last time.”','“No, I did.”'],'de-DE':['„Ich hab letztes Mal gezahlt.“','„Nein, ich.“'],'tr-TR':['“Geçen sefer ben ödedim.”','“Hayır, ben.”']},'hook-1':{'en-GB':['You both keep score.','Neither score matches.'],'de-DE':['Ihr führt beide Buch.','Keins stimmt überein.'],'tr-TR':['İkiniz de hesap tutuyorsunuz.','Hesaplar tutmuyor.']}}},
   {id:'scene-2',notes:'The product as proof: the shared list and the split.',copy:{primary:{'en-GB':['One list.','Split your way.'],'de-DE':['Eine Liste.','Geteilt, wie ihr wollt.'],'tr-TR':['Tek liste.','Sizin usulünüz bölüşüm.']},'hook-1':{'en-GB':['One tap.','You’re even.'],'de-DE':['Ein Tipp.','Ihr seid quitt.'],'tr-TR':['Tek dokunuş.','Ödeştiniz.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['Free for the','first three months'],'de-DE':['Die ersten drei','Monate kostenlos'],'tr-TR':['İlk üç ay','ücretsiz']},'hook-1':{'en-GB':['Free for the','first three months'],'de-DE':['Die ersten drei','Monate kostenlos'],'tr-TR':['İlk üç ay','ücretsiz']}}},
  ]},
 {id:'kiln',name:'Kiln',category:'Local classes: an evening pottery studio',
  fonts:[{family:'Kiln Serif',file:'kiln-bolditalic.ttf',weight:'700',style:'italic',source:'/usr/share/fonts/truetype/crosextra/Caladea-BoldItalic.ttf'},{family:'Kiln Sans',file:'kiln-sans.otf',weight:'500',source:'/usr/share/fonts/opentype/inter/Inter-Medium.otf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 130"><text x="0" y="100" font-family="Caladea" font-weight="700" font-style="italic" font-size="120" fill="currentColor">kiln</text><path d="M236 30q24 -26 48 0" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>`,
  tokens:{'colour.clay':'#B5532F','colour.slip':'#EFE6D8','colour.glaze':'#1F4E5F','colour.soot':'#221C19','type.headline':'Kiln Serif 700 italic, large, expressive, lower case','type.small':'Kiln Sans 500, small, wide tracking, upper case','voice.tone':'Hands-on, unpretentious, proud of imperfection. Invites, never instructs. Dry humour about wonky first pots.','graphic.gesture':'Torn-edge photographs of wet hands and wobbly pots laid on a slip-coloured ground like prints on a studio wall; thumbprints, drips of glaze colour, handwritten-feeling italic type running over the picture edges.','logo.clearSpacePx':24},
  character:'Temperament: earthy, generous, a bit wry. Signature: slip-cream ground, clay-red and deep glaze-teal, torn-edge photographs with real texture (wet clay, fingers, drips), big italic serif that overlaps the pictures, thumbprint marks. Proportions: 50% slip, 25% photograph, 15% clay, 10% glaze. Speech: invites you to make something bad and love it. Substance: hands on a spinning wheel, a lopsided first bowl, shelves of drying pots, the kiln door, glaze drips.',
  product:'Kiln is an evening pottery studio: two-hour classes on the wheel, all clay and firing included, you take home what you made.',
  offer:'First class half price',audience:'Desk workers who want to make something with their hands and are afraid of being bad at it.',
  hooks:{primary:'make something wonky',"hook-1":'hands off the keyboard'},
  cta:{'en-GB':['Book a wheel'],'de-DE':['Scheibe buchen'],'tr-TR':['Bir tezgâh ayırt']},
  scenes:[
   {id:'scene-1',notes:'Permission to be bad at it.',copy:{primary:{'en-GB':['Your first bowl','will be terrible.'],'de-DE':['Deine erste Schale','wird furchtbar.'],'tr-TR':['İlk kâsen','berbat olacak.']},'hook-1':{'en-GB':['Eight hours of typing.','Two hours of mud.'],'de-DE':['Acht Stunden tippen.','Zwei Stunden Matsch.'],'tr-TR':['Sekiz saat klavye.','İki saat çamur.']}}},
   {id:'scene-2',notes:'The class as proof: hands on the wheel.',copy:{primary:{'en-GB':['You’ll love it','anyway.'],'de-DE':['Du wirst sie','trotzdem lieben.'],'tr-TR':['Yine de','bayılacaksın.']},'hook-1':{'en-GB':['No undo button.','That’s the point.'],'de-DE':['Kein Rückgängig.','Genau darum geht’s.'],'tr-TR':['Geri al tuşu yok.','Mesele de bu.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['First class','half price'],'de-DE':['Erster Kurs','zum halben Preis'],'tr-TR':['İlk ders','yarı fiyatına']},'hook-1':{'en-GB':['First class','half price'],'de-DE':['Erster Kurs','zum halben Preis'],'tr-TR':['İlk ders','yarı fiyatına']}}},
  ]},
 {id:'lumo',name:'Lumo',category:'Telecom: fibre broadband for homes',
  fonts:[{family:'Lumo Round',file:'lumo-extrabold.otf',weight:'800',source:'/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'},{family:'Lumo Round',file:'lumo-medium.otf',weight:'500',source:'/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf'}],
  logoSvg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120"><text x="0" y="96" font-family="Inter Display" font-weight="800" font-size="112" letter-spacing="-3" fill="currentColor">lumo</text><circle cx="368" cy="26" r="14" fill="currentColor"/></svg>`,
  tokens:{'colour.violet':'#5B2EFF','colour.candy':'#FF4FA3','colour.sun':'#FFD23F','colour.milk':'#FFF8F0','colour.ink':'#17112B','type.headline':'Lumo Round 800, lower case, very tight, huge','type.small':'Lumo Round 500','voice.tone':'Playful, generous, zero tech-speak. Talks about evenings, not megabits. One joke per ad, never two.','graphic.gesture':'A world of soft glossy rendered objects: inflated numerals, glass tubes with light running through them, squishy household things (a sofa, a router, a loading spinner) as shiny toy-like forms in saturated violet, candy pink and sun yellow, studio-lit with soft shadows.','logo.clearSpacePx':26},
  character:'Temperament: playful, bright, generous. Signature: a rendered toy world: soft, glossy, inflated three-dimensional objects with studio lighting on saturated flat grounds, huge tight lower-case type that the objects lean on or squash. Proportions: 55% violet ground, 25% candy and sun objects, 20% milk type. Speech: evenings and families, not megabits. Substance: the loading spinner as a physical object that finally stops, an inflated number 1000, a glass tube of light entering a house, a sofa with everyone on a different screen.',
  product:'Lumo is fibre broadband: one gigabit to the home, the same price for two years, an engineer installs it in one visit.',
  offer:'Three months free when you switch',audience:'Families whose evening internet dies when everyone is online at once.',
  hooks:{primary:'everyone online at once',"hook-1":'the spinner'},
  cta:{'en-GB':['Check your street'],'de-DE':['Straße prüfen'],'tr-TR':['Sokağını sorgula']},
  scenes:[
   {id:'scene-1',notes:'The evening when everyone is online and everything stalls.',copy:{primary:{'en-GB':['Four screens.','One evening. No fights.'],'de-DE':['Vier Bildschirme.','Ein Abend. Kein Streit.'],'tr-TR':['Dört ekran.','Tek akşam. Kavga yok.']},'hook-1':{'en-GB':['Retire','the spinner.'],'de-DE':['Schick den Ladekreis','in Rente.'],'tr-TR':['Dönen çemberi','emekli et.']}}},
   {id:'scene-2',notes:'The product as proof: a gigabit, shown as something you can almost touch.',copy:{primary:{'en-GB':['A whole gigabit.','All yours.'],'de-DE':['Ein ganzes Gigabit.','Nur für euch.'],'tr-TR':['Koca bir gigabit.','Hepsi sizin.']},'hook-1':{'en-GB':['It just loads.','That’s the whole ad.'],'de-DE':['Es lädt einfach.','Das ist die ganze Werbung.'],'tr-TR':['Açılıyor işte.','Reklam bu kadar.']}}},
   {id:'scene-3',notes:'The offer and the call to action.',copy:{primary:{'en-GB':['Three months free','when you switch'],'de-DE':['Drei Monate gratis','beim Wechsel'],'tr-TR':['Geçiş yapana','üç ay bedava']},'hook-1':{'en-GB':['Three months free','when you switch'],'de-DE':['Drei Monate gratis','beim Wechsel'],'tr-TR':['Geçiş yapana','üç ay bedava']}}},
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
