import {z} from 'zod';
import {directionProgramSchema} from './frame-program';
const legacyPayloads=new Map<unknown,string>([
 [directionProgramSchema.shape.delivery.unwrap(),'DraftDelivery'],
 [directionProgramSchema.shape.quality.unwrap(),'QualityReport'],
 [directionProgramSchema.shape.frames.valueType,'FrameModel'],
]);
/** Document the three historical type-only payloads; all other unsupported schemas still fail. */
export function structuralJSONSchema(schema:z.ZodType){
 return z.toJSONSchema(schema,{unrepresentable:({zodSchema})=>{
  const name=legacyPayloads.get(zodSchema);if(!name)return 'throw';
  return {description:`Opaque legacy ${name} payload. Compiler/engine checks are required; JSON Schema does not validate its internal structure.`};
 }});
}
