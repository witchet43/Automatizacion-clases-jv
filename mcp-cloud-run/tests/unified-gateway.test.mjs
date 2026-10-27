import test from 'node:test';
import assert from 'node:assert/strict';
import {signedAcademicRequest,signedSubmissionRequest} from '../server.mjs';

const config={
  courseIds:new Set(['871149624583']),
  hmac:'x'.repeat(48),
  operationalContext:{contractVersion:'1.1.0',manifestSha256:'f'.repeat(64)}
};
test('academic creation remains draft and uses canonical signed transport',()=>{
  const req=signedAcademicRequest(config,'actividad','871149624583','Actividad de prueba',
    {descripcion:'Ejercicio de aula'},'test_draft_123456789');
  assert.equal(req.action,'uaqExecutor');
  assert.equal(req.params.state,'DRAFT');
  assert.equal(req.operation,'actividad');
  assert.match(req.auth.signature,/^[a-f0-9]{64}$/);
  assert.throws(()=>signedAcademicRequest(config,'actividad','871149624583','X',
    {state:'PUBLISHED'},'test_draft_123456789'),/DRAFT_ONLY_REQUIRED/);
});
test('student grading rejects assignedGrade and nonregistered courses',()=>{
  assert.throws(()=>signedSubmissionRequest(config,'guardarEvaluacionDraft','871149624583',
    '893188672194',{grade:80,assignedGrade:80},'test_draft_123456789'),/DRAFT_ONLY_REQUIRED/);
  assert.throws(()=>signedSubmissionRequest(config,'guardarEvaluacionDraft','1',
    '893188672194',{grade:80},'test_draft_123456789'),/COURSE_NOT_REGISTERED/);
  const req=signedSubmissionRequest(config,'guardarEvaluacionDraft','871149624583',
    '893188672194',{grade:75,submissionId:'submission1'},'test_draft_123456789');
  assert.equal(req.action,'guardarEvaluacionDraft');
  assert.equal(req.params.grade,75);
  assert.match(req.auth.signature,/^[a-f0-9]{64}$/);
});
