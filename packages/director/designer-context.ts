// What the designer reads (designer pipeline plan, point 4b): the visual direction's treatment and the full script
// storyboard for this direction, the full accepted kit (not the director's slimmed summary), the interface inventory,
// the product data, the approved copy of the reference variant, the formats, the feeling brief and the creative focus.
// The brand sheet travels as images in the cached prefix. Generated data modules never enter the context.
import {squarePreviewOnly,squarePreviewInstructions} from './preview-scope';
import {slimDirectorInput} from './inputs';
import type {DirectionInput} from './types';

export function designerContext(input:DirectionInput){
 const {compaction:_compaction,resourceIds:_ids,...slim}=slimDirectorInput(input);void _compaction;void _ids;
 return {...slim,protocol:'designer@1',...(squarePreviewOnly(input)?{draftScope:squarePreviewInstructions}:{}),
  brand:{...slim.brand,
   // The complete accepted kit: instructions, boundaries and every rule as accepted, never summarised.
   kit:input.brand.rawKit,
   ...(input.brand.interface?.length?{interface:input.brand.interface.map(i=>({id:i.id,role:i.role,file:i.url}))}:{}),
   ...(input.brand.sheet?.length?{sheet:input.brand.sheet.map(p=>({section:p.section,page:p.slice+1,note:'Attached as an image: the brand as it looks. Evidence, never a layout to copy.'}))}:{}),
  },
  // Point 5: every scene is designed in the reference format first, then recomposed per ordered format.
  referenceFormat:input.variants[0]?.format,
  copyFor:{locale:input.variants[0]?.locale,hook:input.variants[0]?.hook,cta:input.variants[0]?.cta,length:input.variants[0]?.length},
 };
}
