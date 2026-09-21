import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Regression: las notas completas de Forms se importan aunque la entrega de
// Classroom no esté TURNED_IN. No cambia el estado ni se publica calificación.
const monitor = fs.readFileSync('src/04_MonitorCalificaciones.gs', 'utf8');
const safeForms = fs.readFileSync('src/16_ReconciliacionImportacion.gs', 'utf8');
const policies = fs.readFileSync('src/00_PoliticasCanonicas.gs', 'utf8');
const policyText = policies.match(/FORMS_GRADE_IMPORT:\s*Object\.freeze\(\{[\s\S]*?\}\)/)?.[0] || '';
assert.match(policyText, /REQUIRE_CLASSROOM_TURNED_IN:\s*false/);
assert.match(policyText, /REQUIRE_COMPLETE_FORMS_SCORE:\s*true/);
assert.match(policyText, /WRITE_ONLY_DRAFT_GRADE:\s*true/);
assert.match(policyText, /NEVER_RETURN_SUBMISSION:\s*true/);

const extract = (source, name) => {
  const match = source.match(new RegExp('function\\s+' + name + '\\s*\\([^]*?\\n\\}'));
  assert.ok(match, 'No se encontró función ' + name);
  return match[0];
};
const submissions = [
  {userId:'created',id:'submission-created',state:'CREATED',draftGrade:null,assignedGrade:null},
  {userId:'turned',id:'submission-turned',state:'TURNED_IN',draftGrade:null,assignedGrade:null},
  {userId:'already',id:'submission-already',state:'CREATED',draftGrade:33,assignedGrade:null},
  {userId:'incomplete',id:'submission-incomplete',state:'CREATED',draftGrade:null,assignedGrade:null}
];
const students = ['created','turned','already','incomplete'].map(userId => ({
  userId,profile:{emailAddress:userId+'@example.edu',name:{fullName:userId}}
}));
const formResponse = (email,points) => ({
  getRespondentEmail:()=>email,
  getTimestamp:()=>new Date('2026-09-21T10:00:00Z'),
  getGradableItemResponses:()=>[{getScore:()=>points}]
});
const writes = [];
const policy = {
  REQUIRE_CLASSROOM_TURNED_IN:false, REQUIRE_COMPLETE_FORMS_SCORE:true,
  REQUIRE_EXACT_EMAIL_IDENTITY:true, WRITE_ONLY_DRAFT_GRADE:true,
  PRESERVE_EXISTING_GRADE:true, NEVER_RETURN_SUBMISSION:true
};
const sandbox = {
  ACADEMIC_POLICY:{FORMS_GRADE_IMPORT:policy},
  QUIZ_PIPELINE:{SPREADSHEET_ID:'test-sheet'},
  obtenerAjusteCalificacionQuiz_:()=>0,
  Classroom:{Courses:{
    CourseWork:{
      get:()=>({maxPoints:100,associatedWithDeveloper:false}),
      StudentSubmissions:{
        list:()=>({studentSubmissions:submissions}),
        patch:(body,courseId,workId,id,options)=>{
          assert.deepEqual(Object.keys(body),['draftGrade']);
          assert.equal(options.updateMask,'draftGrade');
          const sub=submissions.find(x=>x.id===id);
          assert.ok(sub);sub.draftGrade=body.draftGrade;writes.push({id,grade:body.draftGrade});
        }
      }
    },
    Students:{list:()=>({students})}
  }},
  FormApp:{openById:()=>({getResponses:()=>[
    formResponse('created@example.edu',80),
    formResponse('turned@example.edu',70),
    formResponse('already@example.edu',90),
    formResponse('incomplete@example.edu',null),
    formResponse('unmatched@example.edu',60)
  ]})},
  SpreadsheetApp:{openById:()=>({getSheetByName:()=>null})}
};
vm.createContext(sandbox);
vm.runInContext(extract(safeForms,'puntajeSeguroRespuestaForms_'),sandbox);
vm.runInContext(extract(monitor,'procesarCalificacionesQuiz_'),sandbox);
const result = vm.runInContext("procesarCalificacionesQuiz_('course','exam','form',true,'quiz')",sandbox);
assert.equal(result.actualizadas,2,'Debe importar CREATED y TURNED_IN.');
assert.equal(result.yaCalificadas,1,'No debe sobrescribir la nota preexistente.');
assert.equal(result.noTurnedIn,3,'Debe auditar entregas no TURNED_IN, sin bloquear.');
assert.equal(result.noTurnedInNoBloqueaImportacion,true);
assert.equal(result.sinPuntajeForms.length,1,'Puntaje incompleto no se importa.');
assert.equal(result.sinCorrespondencia.length,1,'Correo sin correspondencia no se importa.');
assert.equal(submissions[0].draftGrade,80);
assert.equal(submissions[1].draftGrade,70);
assert.equal(submissions[2].draftGrade,33);
assert.equal(submissions[3].draftGrade,null);
assert.equal(writes.length,2);
assert.equal(submissions.every(x=>x.assignedGrade===null),true);
assert.equal(submissions[0].state,'CREATED','No debe marcar la entrega ni devolverla.');
console.log('PASS: Forms completo importa con y sin TURNED_IN; preserva notas existentes, identidad, puntajes completos y DRAFT_ONLY.');
