/** Fields where a campaign uses exactly one value: “Use this” picks it. */
export const singleChoiceFields = new Set<string>(['brandName', 'wordmark', 'icon', 'displayFonts', 'bodyFonts', 'monoFonts']);

/**
 * Findings that carry forward. Excluded findings never do. In a single-choice field the
 * findings marked “Use this” replace the rest; with none marked, everything found is used.
 */
export function selectFindings<T extends {field: string; decision: string}>(items: T[]): T[] {
  const included = items.filter(item => item.decision !== 'reject');
  const picked = new Set(included.filter(item => singleChoiceFields.has(item.field) && item.decision === 'keep').map(item => item.field));
  return included.filter(item => !picked.has(item.field) || item.decision === 'keep');
}
