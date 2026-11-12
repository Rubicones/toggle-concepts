// The brief's language picker: codes are normalised, rare ones are accepted, nonsense is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {localeCode,localeName} from '../packages/contracts/locale-names';

test('language codes typed by hand are normalised; anything else is refused', ()=>{
 assert.equal(localeCode('de-de'),'de-DE');assert.equal(localeCode(' EL_gr '),'el-GR');assert.equal(localeCode('vi'),'vi');
 assert.equal(localeCode('zh-hans-cn'),'zh-Hans-CN');
 for(const bad of ['','german','d','en-G!','12-34'])assert.equal(localeCode(bad),null,bad);
 assert.equal(localeName('de-DE'),'German (Germany)');assert.equal(typeof localeName('xx-YY'),'string');
});
