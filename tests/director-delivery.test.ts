import {test} from 'node:test';
import assert from 'node:assert/strict';
import input from '../fixtures/director/input.json';
import {validateDeliveryVariant} from '../apps/local-runner/director/delivery';
import type {DirectionInput} from '../packages/director/types';
test('delivery exposes only app-issued ordered variants and preserves five parametric axes',()=>{const context=input as DirectionInput;for(const v of context.variants){assert.deepEqual(validateDeliveryVariant(context,v.id),v);assert.deepEqual(Object.keys(v).sort(),['id','format','locale','hook','cta','length'].sort());}assert.throws(()=>validateDeliveryVariant(context,'invented'),/UNISSUED_VARIANT/);});
