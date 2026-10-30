import test from 'node:test';
import assert from 'node:assert/strict';
import {stillPromptText} from '../packages/creative/still-prompt';
test('a still is described in plain words, never sent as a JSON pack',()=>{
 const text=stillPromptText(JSON.stringify({purpose:'Musicians nodding',shot:'Fast cut back to musicians nodding in agreement',protectedArea:{x:.3,y:.2,w:.4,h:.3},cropMargins:{x:.15,y:.15,w:.7,h:.7},screenInsert:'empty',look:{treatment:'Moody studio',palette:['#070707'],light:'Brand lighting'},prohibitions:['No text or lettering','Never render logos'],aspectRatio:'9:16'}));
 assert.doesNotMatch(text,/[{}]/);assert.match(text,/9:16/);assert.match(text,/musicians nodding/);assert.match(text,/30% to 70% across/);
 assert.match(text,/Do not include: text or lettering; logos;/);assert.doesNotMatch(text,/Light: Brand lighting/);
});
