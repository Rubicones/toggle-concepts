/** Which role used its allowance, from the stop code and its detail ("assembler: input …"). */
export function exhaustedRole(technical:string|undefined):'director'|'assembler'|'critic'|'designer'|null{
 if(!technical)return null;if(technical.startsWith('ASSEMBLER_ALLOWANCE_EXHAUSTED'))return 'assembler';if(technical.startsWith('DIRECTOR_ALLOWANCE_EXHAUSTED'))return 'director';
 // The designer (blocks with its own allowance, migration 20261103000300) continues the same way as the other roles.
 return (/^ROLE_ALLOWANCE_EXHAUSTED: (director|assembler|critic|designer)\b/.exec(technical)?.[1] as 'director'|'assembler'|'critic'|'designer'|undefined)??null;
}
