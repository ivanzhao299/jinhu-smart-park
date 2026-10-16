import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {isHrEmployeeFeedbackText:valid,HR_EMPLOYEE_FEEDBACK_LIMITS:L}=require('../../packages/shared/dist');
test('feedback Unicode limits, newline and actual NUL contract',()=>{assert.ok(valid('😀'.repeat(L.content),L.content));assert.equal(valid('😀'.repeat(L.content+1),L.content),false);assert.ok(valid('First\nSecond',L.content));assert.equal(valid('Actual\u0000NUL',L.content),false);assert.ok(valid(String.raw`Literal\u0000text`,L.content));assert.equal(valid(' \n ',L.content),false);assert.equal(valid('一',L.reason,2),false);assert.ok(valid('二字',L.reason,2));});
test('four source menu anchors identify modern route without rule equivalence claims',()=>{const mapping=JSON.parse(readFileSync(new URL('../hr-cutover/contracts/legacy-group-web-module-mapping-v1.json',import.meta.url),'utf8'));const found=[];function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if([121,122,123,124].includes(v.legacyId))found.push(v);Object.values(v).forEach(walk);}}walk(mapping);assert.equal(found.length,4);for(const row of found)assert.deepEqual(row.targetRoutes,['/hr/employee-feedback']);});
