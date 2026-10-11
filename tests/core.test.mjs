import test from 'node:test';
import assert from 'node:assert/strict';
import {validLoop,storyText,demoReply} from '../app/core.mjs';
test('loop duration rejects invalid metadata and clips over 15 seconds',()=>{for(const v of [NaN,Infinity,0,-1,15.001,30])assert.equal(validLoop(v),false);for(const v of [.1,6,15])assert.equal(validLoop(v),true)});
test('export preserves chosen identities, scene and exact dialogue',()=>{const s={player:'p',partner:'c',scene:'s',messages:[{role:'user',text:'Hello <world>\nNew line'},{role:'assistant',text:'Welcome.'}]};assert.equal(storyText(s,[{id:'p',name:'Rowan'},{id:'c',name:'Mira'}],[{id:'s',name:'Garden'}]),'Garden\nRowan & Mira\n\nRowan: Hello <world>\nNew line\n\nMira: Welcome.')});
test('demo dialogue uses selected companion and scene, not a fixed cast',()=>{assert.match(demoReply('hello','Iris','Cloud city',0),/Iris.*Cloud city/);assert.match(demoReply('where next','Iris','Cloud city',0),/Cloud city/)});
