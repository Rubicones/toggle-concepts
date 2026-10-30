import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directorCommand} from '../packages/director/commands';
const id='10000000-0000-4000-8000-000000000001';
test('AD notes and price approval are distinct commands and layer edits are rejected',()=>{assert.ok(directorCommand.safeParse({action:'note',iterationId:id,recipient:'assembler',text:'Hold the comment longer.',requestId:id}).success);assert.equal(directorCommand.safeParse({action:'approve',maxCostMicroUsd:100}).success,false);assert.equal(directorCommand.safeParse({action:'note',iterationId:id,recipient:'assembler',text:'Move it.',requestId:id,layer:{x:10}}).success,false);assert.ok(directorCommand.safeParse({action:'approve',quoteId:'a'.repeat(64),maxCostMicroUsd:100}).success);});
