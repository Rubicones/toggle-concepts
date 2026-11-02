/**
 * The AD's creative focus: a short direction written after the questionnaire and before the run, editable later.
 * It is the AD's own decision, so agents develop it instead of replacing it; the application never supplies one.
 * It never outranks approved facts, copy, brand rules or permissions.
 */
export const CREATIVE_FOCUS_LIMIT=2000;
/** Planning roles that receive the focus; research, variants and localization work on evidence and scope only. */
export const CREATIVE_FOCUS_ROLES=['strategy','script','visual-direction'] as const;

export function normalizeCreativeFocus(value:unknown){return typeof value==='string'?value.trim().slice(0,CREATIVE_FOCUS_LIMIT):'';}

/** The instruction block every creative agent and review receives; empty when the AD left the focus open. */
export function creativeFocusBlock(value:unknown){
 const focus=normalizeCreativeFocus(value);
 if(!focus)return '';
 return `AD CREATIVE FOCUS (the art director's own direction for this campaign, the first creative instruction): """${focus.replaceAll('"""','"')}"""
Work inside this focus: interpret it, develop it and execute it with full craft; never replace it with a different direction or dilute it into a safer one. Where it names a format, technique or look, that is the AD's choice, not a template to avoid. It never overrides approved facts, copy, brand rules or permissions: where it conflicts with them, follow those and name the conflict for the AD.`;
}
