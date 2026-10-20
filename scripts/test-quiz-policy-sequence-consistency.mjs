import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const canonical = fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
const validator = fs.readFileSync('src/33_QuizSencillo.gs','utf8');
const engine = fs.readFileSync('src/64_QuizAsistenciaRapido.gs','utf8');
const expected='LATEST_EXISTING_QUIZ_DRAFT_OR_PUBLISHED';

// Invariant: the authored policy, two independent runtime validators and
// next-number engine must all agree. The old LATEST_PUBLISHED_QUIZ value
// caused signed write requests to reserve a receipt and fail before mutation.
assert.match(canonical,/SEQUENCE_SOURCE:\s*'LATEST_EXISTING_QUIZ_DRAFT_OR_PUBLISHED'/);
assert.match(canonical,/simpleQuiz\.SEQUENCE_SOURCE!==\s*'LATEST_EXISTING_QUIZ_DRAFT_OR_PUBLISHED'/);
assert.match(validator,/policy\.SEQUENCE_SOURCE!==\s*'LATEST_EXISTING_QUIZ_DRAFT_OR_PUBLISHED'/);
assert.doesNotMatch(canonical,/LATEST_PUBLISHED_QUIZ/);
assert.doesNotMatch(validator,/LATEST_PUBLISHED_QUIZ/);
assert.match(engine,/\['PUBLISHED','DRAFT'\]/);
assert.match(engine,/const lastExisting=all\[0\]\|\|null/);

// Execute the REAL validator against the production policy object.
const sandbox={Date,Utilities:{formatDate:()=>''}};
vm.createContext(sandbox);
vm.runInContext(canonical+'\n'+validator,sandbox);
const actual=vm.runInContext('ACADEMIC_POLICY.CLASSROOM.SIMPLE_QUIZ',sandbox);
assert.equal(actual.SEQUENCE_SOURCE,expected);
assert.equal(sandbox.validarPoliticaQuizSencillo_(actual),true);
assert.throws(()=>sandbox.validarPoliticaQuizSencillo_({...actual,SEQUENCE_SOURCE:'LATEST_PUBLISHED_QUIZ'}),/QUIZ_ASISTENCIA_POLITICA_INVALIDA/);
console.log('PASS: canonical policy, runtime quiz validator and consecutive engine agree on DRAFT+PUBLISHED');
