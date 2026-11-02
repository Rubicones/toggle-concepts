import {z} from 'zod';

/**
 * The "Feel" and "Look" parts of the brief: choice-based answers about how the campaign should feel and look.
 * Every single-choice question accepts "suggest" (the agents propose from the brand kit). Choices are preferences
 * and evidence for the creative agents, never layout templates or mandatory recipes (AGENTS.md §2).
 */
export const SUGGEST='suggest' as const;

/** What the viewer should feel. Labels only: agents translate a feeling into this brand's own look; no stock sensory recipe. */
export const feelings=[
 {id:'warmth',label:'Warmth & care'},
 {id:'craft',label:'Tactile & crafted'},
 {id:'calm-confidence',label:'Calm confidence'},
 {id:'energy',label:'Energy & drive'},
 {id:'creative-freedom',label:'Creative freedom'},
 {id:'premium',label:'Premium'},
 {id:'clarity',label:'Clarity & help'},
 {id:'play',label:'Play & humour'},
 {id:'bold',label:'Bold & challenging'},
 {id:'wonder',label:'Wonder'},
 {id:'belonging',label:'Belonging'},
 {id:'urgency',label:'Deal & urgency'},
] as const;
export type FeelingId=(typeof feelings)[number]['id'];

/** Brand character axes, 1 = left pole, 5 = right pole. The brand kit provides the usual value; the brief may shift it. */
export const characterAxes=[
 {id:'temperature',left:'Warm',right:'Cool'},
 {id:'volume',left:'Quiet',right:'Loud'},
 {id:'texture',left:'Tactile, crafted',right:'Digital, clean'},
 {id:'tone',left:'Serious',right:'Playful'},
 {id:'novelty',left:'Familiar',right:'Experimental'},
 {id:'price',left:'Accessible',right:'Premium'},
] as const;
export type AxisId=(typeof characterAxes)[number]['id'];

export const lookOptions={
 stretch:[{id:'on-brand',label:'Strictly on brand',hint:'all three directions stay inside the usual brand style'},{id:'fresh',label:'Recognisable, but fresh',hint:'one direction at the brand core, two step aside'},{id:'bold',label:'Bold, try something new',hint:'directions may stretch the brand; kit rules still hold'}],
 light:[{id:'soft-daylight',label:'Soft daylight'},{id:'golden-hour',label:'Golden hour'},{id:'hard-sun',label:'Hard sun & graphic shadows'},{id:'dark-studio',label:'Dark studio, sculpted'},{id:'direct-flash',label:'Direct flash'},{id:'night-neon',label:'Night & city light'}],
 medium:[{id:'live',label:'Photographed'},{id:'digital',label:'Made, not photographed'},{id:'mix',label:'Both'}],
 world:[{id:'real-life',label:'Real life moments'},{id:'studio',label:'Studio & still life'},{id:'home',label:'Home'},{id:'city',label:'City'},{id:'nature',label:'Nature'},{id:'product-interface',label:'Interface as the hero'},{id:'motion-graphics',label:'Motion graphics'},{id:'object-3d',label:'3D objects & materials'},{id:'typography-led',label:'Type as the visual'},{id:'illustration',label:'Illustration'},{id:'data-diagrams',label:'Data & diagrams'},{id:'abstract-graphic',label:'Abstract & graphic'}],
 energy:[{id:'still',label:'Still and composed'},{id:'gentle',label:'Gentle movement'},{id:'dynamic',label:'Dynamic and fast'}],
 colour:[{id:'brand-only',label:'Brand colours only'},{id:'brand-natural',label:'Brand + natural colours'},{id:'bold-contrast',label:'Bold contrast'},{id:'soft-muted',label:'Soft and muted'}],
 typeRole:[{id:'type-led',label:'Type carrying the idea'},{id:'balanced',label:'Type and picture together'},{id:'picture-led',label:'The picture carrying it'}],
 productRole:[{id:'hero',label:'The product up close'},{id:'in-use',label:'The product in use'},{id:'result',label:'The result instead of the product'},{id:'not-shown',label:'No product at all'}],
 people:[{id:'none',label:'No people'},{id:'hands',label:'Hands only'},{id:'yes',label:'Yes'}],
 textAmount:[{id:'minimal',label:'Minimal'},{id:'balanced',label:'Balanced'},{id:'detailed',label:'Detailed'}],
 humour:[{id:'none',label:'None'},{id:'light',label:'A light touch'},{id:'central',label:'Humour is the idea'}],
 avoid:[{id:'stock',label:'Stock look'},{id:'ai-look',label:'AI-looking images'},{id:'gloomy',label:'Gloomy'},{id:'shouty',label:'Shouty retail'},{id:'corporate',label:'Corporate clichés'},{id:'childish',label:'Childish'},{id:'glossy',label:'Glossy'},{id:'cluttered',label:'Cluttered'},{id:'pompous',label:'Pompous'}],
 referenceAspects:[{id:'colour',label:'Colour'},{id:'light',label:'Light'},{id:'composition',label:'Composition'},{id:'type',label:'Type'},{id:'mood',label:'Mood'},{id:'product-shot',label:'Product shot'},{id:'people',label:'People'},{id:'rhythm',label:'Rhythm'}],
} as const;

/** Extra campaign answers that sharpen the scenario; all optional. */
export const campaignOptions={
 goal:[{id:'awareness',label:'Get known'},{id:'installs',label:'App installs'},{id:'sign-ups',label:'Sign-ups'},{id:'sales',label:'Sales'},{id:'engagement',label:'Engagement'},{id:'retention',label:'Bring people back'}],
 awareness:[{id:'new-to-category',label:'New to the category'},{id:'knows-category',label:'Knows the category, not us'},{id:'knows-us',label:'Knows us'},{id:'customers',label:'Our customers'}],
 platforms:[{id:'meta',label:'Instagram & Facebook'},{id:'tiktok',label:'TikTok'},{id:'youtube',label:'YouTube'},{id:'google',label:'Google Ads'},{id:'app-stores',label:'App stores'},{id:'programmatic',label:'Display & programmatic'},{id:'other',label:'Other'}],
} as const;

const ids=<T extends readonly {id:string}[]>(list:T)=>list.map(x=>x.id) as [T[number]['id'],...T[number]['id'][]];
const choice=<T extends readonly {id:string}[]>(list:T)=>z.enum([...ids(list),SUGGEST]);
const openTo=<T extends readonly {id:string}[]>(list:T,max:number)=>z.preprocess(v=>typeof v==='string'?(v===SUGGEST?[]:[v]):v,z.array(z.enum(ids(list))).max(max)).default([]);
const reference=z.strictObject({assetId:z.uuid().optional(),url:z.string().url().max(500).optional(),aspects:z.array(z.enum(ids(lookOptions.referenceAspects))).max(8).default([]),note:z.string().max(300).default('')});

export const briefFeelSchema=z.strictObject({
 /** First entry is the main feeling; up to two more. Empty = agents propose. */
 feelings:z.array(z.enum(ids(feelings))).max(3).default([]),
 /** Campaign value per axis; missing = keep the brand kit's usual value. */
 character:z.partialRecord(z.enum(ids(characterAxes)),z.number().int().min(1).max(5)).default({}),
 stretch:choice(lookOptions.stretch).default(SUGGEST),
 medium:choice(lookOptions.medium).default(SUGGEST),
 light:z.array(z.enum([...ids(lookOptions.light),SUGGEST])).max(2).default([]),
 world:openTo(lookOptions.world,4),
 energy:choice(lookOptions.energy).default(SUGGEST),
 colour:choice(lookOptions.colour).default(SUGGEST),
 typeRole:openTo(lookOptions.typeRole,3),
 productRole:openTo(lookOptions.productRole,4),
 people:choice(lookOptions.people).default(SUGGEST),
 peopleNote:z.string().max(300).default(''),
 textAmount:choice(lookOptions.textAmount).default(SUGGEST),
 humour:choice(lookOptions.humour).default(SUGGEST),
 endFeeling:z.string().max(300).default(''),
 avoid:z.array(z.enum(ids(lookOptions.avoid))).max(9).default([]),
 avoidNote:z.string().max(500).default(''),
 likes:z.array(reference).max(3).default([]),
 dislikes:z.array(reference).max(3).default([]),
});
export type BriefFeel=z.infer<typeof briefFeelSchema>;

export const briefCampaignExtrasSchema={
 goal:choice(campaignOptions.goal).optional(),
 benefit:z.string().max(400).optional(),
 proof:z.string().max(600).optional(),
 difference:z.string().max(400).optional(),
 audienceTension:z.string().max(600).optional(),
 audienceAwareness:choice(campaignOptions.awareness).optional(),
 platforms:z.array(z.enum(ids(campaignOptions.platforms))).max(7).optional(),
};

const label=<T extends readonly {id:string;label:string}[]>(list:T,id:string)=>list.find(x=>x.id===id)?.label??id;
const clip=(s:unknown,n:number)=>typeof s==='string'&&s.trim()?(s.trim().length>n?s.trim().slice(0,n-1)+'…':s.trim()):'';

/**
 * Compact, deterministic feeling brief for every creative role (about 1.6k characters at most). It combines the
 * client's choices with the accepted brand kit's voice, imagery and motion rules. "suggest" and empty answers are
 * stated explicitly so agents propose from the kit instead of inventing a generic default.
 */
export function compileFeelingBrief(questionnaire:Record<string,unknown>|undefined,brandTokens:Record<string,unknown>={}):{text:string;data:Record<string,unknown>}|undefined{
 const q=questionnaire??{},parsed=briefFeelSchema.safeParse(q.feel??{}),feel=parsed.success?parsed.data:briefFeelSchema.parse({});
 const lines:string[]=[];
 const main=feel.feelings[0],more=feel.feelings.slice(1);
 const hint=(id:string)=>feelings.find(f=>f.id===id);
 lines.push(main?`Main feeling: ${hint(main)!.label}. Translate it into this brand's own look; it is not a recipe.${more.length?` Also: ${more.map(id=>hint(id)!.label).join(', ')}.`:''}`:'Feeling: not chosen; derive it from the brand character and the product benefit, and state your choice.');
 const shifts=characterAxes.filter(a=>feel.character[a.id]!==undefined).map(a=>`${a.left}–${a.right} ${feel.character[a.id]}/5`);
 if(shifts.length)lines.push(`Campaign character (1 = first pole, 5 = second): ${shifts.join('; ')}.`);
 const stretch=lookOptions.stretch.find(s=>s.id===feel.stretch);
 lines.push(stretch?`How far from the usual style: ${stretch.label}: ${stretch.hint}.`:'How far from the usual style: suggest; make one direction the brand core and two clearly different.');
 const real=(value:string|readonly string[])=>(Array.isArray(value)?value:[value]).filter(x=>x!==SUGGEST);
 const named=(value:string|readonly string[],list:readonly {id:string;label:string}[])=>real(value).map(x=>label(list,x)).join(' + ');
 const boundaries=[real(feel.medium).length?`pictures ${named(feel.medium,lookOptions.medium).toLowerCase()}`:'',real(feel.people).length?`people ${named(feel.people,lookOptions.people).toLowerCase()}${feel.people==='yes'&&feel.peopleNote?` (${clip(feel.peopleNote,120)})`:''}`:''].filter(Boolean);
 if(boundaries.length)lines.push(`Boundaries (hold these): ${boundaries.join('; ')}.`);
 const leanings=([['light',feel.light,lookOptions.light],['energy',feel.energy,lookOptions.energy],['colour',feel.colour,lookOptions.colour],['words on screen',feel.textAmount,lookOptions.textAmount],['humour',feel.humour,lookOptions.humour]] as [string,string|readonly string[],readonly {id:string;label:string}[]][]).filter(([,v])=>real(v).length).map(([n,v,l])=>`${n} ${named(v,l).toLowerCase()}`);
 if(leanings.length)lines.push(`Leanings (tone only; follow them where they serve your idea): ${leanings.join('; ')}.`);
 const open=([['worlds',feel.world,lookOptions.world],['type',feel.typeRole,lookOptions.typeRole],['product',feel.productRole,lookOptions.productRole]] as [string,readonly string[],readonly {id:string;label:string}[]][]).filter(([,v])=>v.length).map(([n,v,l])=>`${n}: ${named(v,l).toLowerCase()}`);
 if(open.length)lines.push(`Open to (the client would not mind these; none is requested, a direction using none of them is fine, and none is a format to fill): ${open.join('; ')}.`);
 if(!boundaries.length&&!leanings.length&&!open.length)lines.push('Look: not chosen; propose it from the brand kit.');
 if(feel.endFeeling)lines.push(`Feeling at the end: "${clip(feel.endFeeling,200)}".`);
 if(feel.avoid.length||feel.avoidNote)lines.push(`Avoid: ${[...feel.avoid.map(a=>label(lookOptions.avoid,a)),clip(feel.avoidNote,200)].filter(Boolean).join(', ')}.`);
 const refs=(list:BriefFeel['likes'],word:string)=>list.length?`${list.length} reference(s) ${word}${list.flatMap(r=>r.aspects).length?` for ${[...new Set(list.flatMap(r=>r.aspects))].map(a=>label(lookOptions.referenceAspects,a)).join(', ')}`:''}${list.some(r=>r.note)?` (${list.map(r=>clip(r.note,80)).filter(Boolean).join('; ')})`:''}`:'';
 const refLine=[refs(feel.likes,'liked'),refs(feel.dislikes,'disliked')].filter(Boolean).join('; ');if(refLine)lines.push(`References: ${refLine}. Use liked ones for the named aspects only; never copy them.`);
 const campaign=[q.benefit?`benefit: ${clip(q.benefit,200)}`:'',q.proof?`proof: ${clip(q.proof,240)}`:'',q.difference?`difference: ${clip(q.difference,200)}`:'',q.audienceTension?`audience tension: ${clip(q.audienceTension,240)}`:'',typeof q.audienceAwareness==='string'&&q.audienceAwareness!==SUGGEST?`audience knows: ${label(campaignOptions.awareness,q.audienceAwareness)}`:'',typeof q.goal==='string'&&q.goal!==SUGGEST?`goal: ${label(campaignOptions.goal,q.goal)}`:''].filter(Boolean);
 if(campaign.length)lines.push(`Campaign: ${campaign.join('; ')}.`);
 const kit=['voice.tone','voice.character','voice.copyRules','voice.samples','imagery.treatment','motion.motionSystem'].map(k=>brandTokens[k]?`${k}: ${clip(brandTokens[k],k==='voice.samples'?260:200)}`:'').filter(Boolean);
 lines.push(kit.length?`Brand kit (wins over every choice above): ${kit.join(' | ')}`:'Brand kit: no voice or imagery rules accepted yet; infer carefully from the supplied evidence and say so.');
 let text=`FEELING BRIEF (tone and room from the client, not instructions; an AD creative focus, when given, leads it; anything not chosen is yours to propose from the brand kit):\n${lines.join('\n')}`;
 if(text.length>1800)text=text.slice(0,1799)+'…';
 return {text,data:{feelings:feel.feelings,character:feel.character,stretch:feel.stretch,medium:feel.medium,light:feel.light,world:feel.world,energy:feel.energy,colour:feel.colour,typeRole:feel.typeRole,productRole:feel.productRole,people:feel.people,textAmount:feel.textAmount,humour:feel.humour,avoid:feel.avoid}};
}

/** Accepted brand-kit rules as "category.key" → value, the shape the director's brand module also uses. */
export function brandTokensFromKit(kit:unknown):Record<string,string>{
 // A brand revision row stores the kit under payload.kit (studio_brand_revisions); a bare kit has rules at the top.
 const k=kit as {payload?:{rules?:unknown;kit?:{rules?:unknown}};rules?:unknown}|null|undefined,rules=k?.payload?.kit?.rules??k?.payload?.rules??k?.rules;
 if(!Array.isArray(rules))return {};
 return Object.fromEntries(rules.filter((r:{decision?:string;category?:string;key?:string;value?:unknown})=>r&&(r.decision===undefined||r.decision==='accepted')&&typeof r.category==='string'&&typeof r.key==='string'&&typeof r.value==='string').map((r:{category:string;key:string;value:string})=>[`${r.category}.${r.key}`,r.value]));
}

/** Adds the compact feeling brief to a planning context that carries the submitted brief but not yet the brief itself. */
export function withFeelingBrief<T extends Record<string,unknown>>(context:T|undefined):T|undefined{
 if(!context||typeof context.feelingBrief==='string')return context;
 const submitted=context.submittedBrief as {questionnaire?:Record<string,unknown>}|undefined;
 if(!submitted||typeof submitted!=='object')return context;
 const text=compileFeelingBrief(submitted.questionnaire,brandTokensFromKit(context.acceptedBrandKit))?.text;
 return text?{...context,feelingBrief:text}:context;
}
