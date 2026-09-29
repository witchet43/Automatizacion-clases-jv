#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
const entrypoints=fs.readFileSync('src/22_EntrypointsRecursosSeguros.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const practice=fs.readFileSync('src/30_PracticaConGoogleDoc.gs','utf8');
const genericDoc=fs.readFileSync('src/31_GoogleDocumentoAcademico.gs','utf8');
const importFacade=fs.readFileSync('src/15b_OperacionesImportacionFacade.gs','utf8');
const deliveryFacade=fs.readFileSync('src/08b_CalificarEstadoEntrega.gs','utf8');

for(const name of ['quizAsistencia','actividad','tarea','practica','quiz','examen','material','resolverClase','clase','importarCalificaciones','revisarTrabajos','calificarEstadoEntrega','cerrarUnidad']){
  assert.match(policy,new RegExp(name+':Object\\.freeze'));
}

assert.match(policy,/quizAsistencia:Object\.freeze\(\{mode:'EXECUTE_FIRST'/);
assert.match(policy,/firstAction:'WEB_APP'/);
assert.match(policy,/preflight:Object\.freeze\(\[\]\)/);
assert.doesNotMatch(entrypoints,/8_PLANNINGS_READ_ONLY_REQUIRED/);
assert.doesNotMatch(entrypoints,/assertAcademicAutomationWriteEnabled_\(ctx\.params\.materia\)/);
assert.match(entrypoints,/academicReadinessGate:'TARGET_PLANNING_ONLY'/);

assert.match(web,/if\(!action\)throw new Error\('ACCION_REQUERIDA'\)/);
assert.doesNotMatch(web,/p\.action\|\|'quizAsistencia'/);
assert.match(web,/p\.courseId\|\|p\.course\|\|p\.courseKey\|\|p\.materia/);
assert.match(web,/crearGoogleDocumentoAcademico_/);
assert.doesNotMatch(web,/crearGoogleDocumentoPractica_\(\{/);
assert.match(web,/PARCIAL_NO_VERIFICABLE/);
assert.match(web,/expectedResourceTypes/);

assert.match(practice,/return crearGoogleDocumentoAcademico_\(\{titulo:titulo,html:html\}\)/);
assert.match(genericDoc,/function crearGoogleDocumentoAcademico_/);
assert.match(importFacade,/function importarCalificacionesQuiz/);
assert.match(importFacade,/function importarCalificacionesInstrumento/);
assert.match(deliveryFacade,/revisionAcademica=false/);
assert.match(policy,/revisarTrabajos:Object\.freeze\(\{mode:'ACADEMIC_REVIEW'/);
assert.match(policy,/calificarEstadoEntrega:Object\.freeze\(\{mode:'ADMIN_PROTECTED'/);

console.log('OK: contratos transversales, acción explícita, preflight único, Docs desacoplados, clase verificable e importación/revisión sin ambigüedad.');
