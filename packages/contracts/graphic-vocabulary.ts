import {z} from 'zod';
const color=z.string().min(1),num=z.number().finite(),pad=z.tuple([num,num,num,num]);
export const vectorShapeSchema=z.strictObject({view_box:z.tuple([z.number().positive(),z.number().positive()]),paths:z.array(z.strictObject({d:z.string().min(1),fill:color.optional(),stroke:color.optional(),width:z.number().nonnegative().optional()})).max(40)});
export const treatmentSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('plain')}),
 z.strictObject({kind:z.literal('plaque'),pad,height:num.optional(),radius:num.optional(),fill:color,on:color}),
 z.strictObject({kind:z.literal('box'),pad,radius:num.optional(),fill:color,on:color}),
 z.strictObject({kind:z.literal('button'),pad,radius:z.union([num,z.literal('pill')]),fill:color,on:color}),
 z.strictObject({kind:z.literal('highlight'),fill:color,pad:z.tuple([num,num]),height:z.number().positive(),offset:num,on:color.optional()}),
 z.strictObject({kind:z.literal('underline'),color,thickness:z.number().positive(),offset:num}),z.strictObject({kind:z.literal('link'),color})
]);
export const paintSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('flat'),color}),
 z.strictObject({kind:z.literal('gradient'),type:z.enum(['linear','radial']),angle:num.optional(),stops:z.array(z.strictObject({at:z.number().min(0).max(1),color})).min(2)}),
 z.strictObject({kind:z.literal('pattern'),graphic:z.string(),scale_u:z.number().positive(),gap_u:z.number().nonnegative(),color,bg:color,rotation:num.optional()}),
 z.strictObject({kind:z.literal('texture'),material:z.string(),color,edge:z.string().optional(),change_fps:z.number().positive().optional()})
]);
export const markSchema=z.strictObject({kind:z.enum(['shape','tongue']),shape:vectorShapeSchema.optional(),size_u:z.tuple([z.number().positive(),z.number().positive()]),fills:z.array(color),text:z.strictObject({fixed:z.union([z.string(),z.record(z.string(),z.string())]),style:z.string(),color,box:z.tuple([num,num,num,num])}).optional(),rotation:num.optional(),radius_u:num.optional(),placement:z.string().optional()});
export const iconSchema=z.strictObject({kind:z.enum(['svg','icon','pattern']),shape:vectorShapeSchema,stroke_u:num.optional()});
export const graphicVocabularySchema=z.strictObject({paints:z.record(z.string(),paintSchema),treatments:z.record(z.string(),treatmentSchema),marks:z.record(z.string(),markSchema),icons:z.record(z.string(),iconSchema)});
export const graphicProposalSchema=z.strictObject({button:z.strictObject({radius:z.union([z.number().min(0).max(2),z.literal('pill')])}).optional(),highlight:z.strictObject({height:z.number().min(.1).max(1.5),offset:z.number().min(-1).max(1)}).optional(),patternSvg:z.string().max(16000).optional(),iconStyle:z.string().max(300).optional(),icons:z.array(z.strictObject({id:z.string().regex(/^[a-zA-Z][\w-]*$/),svg:z.string().max(16000)})).max(6).optional()});
