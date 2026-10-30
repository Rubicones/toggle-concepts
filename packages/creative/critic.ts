export const isEngineFinding=(text:string)=>/\b(?:L_|M_)[A-Z_]+\b|(?:engine|geometry)\s+(?:warning|finding)|(?:overlap|contrast|platform zone|text fit|key crop)/i.test(text);
import type {CreativeCritic,CreativeIssue} from '../contracts/creative-drafts';
import type {CreativeDirection} from '../contracts/frame-program';
import {validateCritic} from './validate';
export function routeCritic(critic:CreativeCritic,direction:CreativeDirection):{script:CreativeIssue[];treatment:CreativeIssue[];scenes:CreativeIssue[];media:CreativeIssue[];ad:CreativeIssue[]}{
 const invalid=validateCritic(critic,direction);if(invalid.length)throw new Error('CRITIC_PATH_INVALID');
 const routes={script:[] as CreativeIssue[],treatment:[] as CreativeIssue[],scenes:[] as CreativeIssue[],media:[] as CreativeIssue[],ad:[] as CreativeIssue[]};
 for(const finding of critic.findings){if(isEngineFinding(finding.rule))continue;const stage=finding.owner==='script'?'script':finding.owner==='visual'?'treatment':finding.owner==='compositor'||finding.owner==='code'?'scenes':finding.owner==='media'?'media':'ad';routes[stage].push({code:finding.rule,severity:finding.severity,path:direction.skeleton&&finding.slot?finding.slot:finding.path.replace(new RegExp(`^${stage}\\.`),''),owner:finding.owner,message:`Creative critic: ${finding.rule}`,fix:finding.fix});}
 return routes;
}
