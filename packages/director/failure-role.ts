/** Which role used its allowance, from the stop code and its detail ("assembler: input …"). */
export function exhaustedRole(technical:string|undefined):'director'|'assembler'|'critic'|null{
 if(!technical)return null;if(technical.startsWith('ASSEMBLER_ALLOWANCE_EXHAUSTED'))return 'assembler';if(technical.startsWith('DIRECTOR_ALLOWANCE_EXHAUSTED'))return 'director';
 return (/^ROLE_ALLOWANCE_EXHAUSTED: (director|assembler|critic)\b/.exec(technical)?.[1] as 'director'|'assembler'|'critic'|undefined)??null;
}
