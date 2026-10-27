import test from 'node:test';
import assert from 'node:assert/strict';
import {signedCourseClosureRequest} from '../server.mjs';

const config={courseIds:new Set(['871149624583']),
  hmac:'x'.repeat(48),operationalContext:{contractVersion:'1.1.0'}};
test('final course grade defaults to equal unit weights on Apps Script',()=>{
 const q=signedCourseClosureRequest(config,'871149624583',[1,2,3]);
 assert.equal(q.operation,'cerrarMateria');
 assert.equal(q.params.ponderaciones,undefined);
 assert.deepEqual(q.params.unidades,[1,2,3]);
 assert.equal(q.params.modo,'PUBLISHED_COURSEWORK_DRAFT_GRADE_ONLY');
 assert.match(q.auth.signature,/^[a-f0-9]{64}$/);
});
test('custom weights must be explicit and total 100 percent',()=>{
 const q=signedCourseClosureRequest(config,'871149624583',[1,2,3],[20,30,50]);
 assert.deepEqual(q.params.ponderaciones,[20,30,50]);
 assert.throws(()=>signedCourseClosureRequest(config,'871149624583',[1,2],[40,40]),/COURSE_WEIGHTS_INVALID/);
 assert.throws(()=>signedCourseClosureRequest(config,'871149624583',[1,1]),/UNITS_INVALID/);
 assert.throws(()=>signedCourseClosureRequest(config,'999',[1,2]),/COURSE_NOT_REGISTERED/);
});
