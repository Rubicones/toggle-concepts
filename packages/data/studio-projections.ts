import type { BrandMaterial, MaterialExtraction } from '../contracts/brand-intake';

// List screens need state and cost, never the frozen prompt/context snapshot.
export const agentStepSummaryColumns = 'id,campaign_id,run_id,role,model_id,status,cost_micro_usd,reserve_micro_usd,error_code,created_at';
export const agentStepDetailColumns = `${agentStepSummaryColumns},prompt,output,usage`;
export const materialPreviewColumns = 'id,filename,relative_path,mime,bytes,sha256,state,included,error_code,extraction_sha,created_at,kind:extraction->>kind,images:extraction->images,warnings:extraction->warnings,metadata:extraction->metadata';

export function materialPreview(row: Record<string, unknown>): BrandMaterial {
  const { kind, images, warnings, metadata, ...material } = row;
  const meta = (metadata ?? {}) as MaterialExtraction['metadata'];
  return { ...material, extractedChars: typeof meta.textChars === 'number' ? meta.textChars : undefined,
    extraction: kind ? { schemaVersion: '1.0', kind, images: images ?? [], warnings: warnings ?? [], metadata: meta, text: '' } : null,
  } as BrandMaterial;
}
