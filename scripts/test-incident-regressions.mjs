import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=JSON.parse(fs.readFileSync('src/appsscript.json','utf8'));
const arch=fs.readFileSync('scripts/test-architecture-boundaries.mjs','utf8');
const ctx=fs.readFileSync('scripts/academic-context.mjs','utf8');
const guard=fs.readFileSync('src/00_AcademicContextGuard.gs','utf8');
const master=fs.readFileSync('src/39_MasterGuardrails.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const attendance=fs.readFileSync('src/64_QuizAsistenciaRapido.gs','utf8');
const monitor=fs.readFileSync('src/00_SolicitudImportacionCalificaciones.gs','utf8');
const legacy=fs.readFileSync('src/36_LegacyTriggerCleanup.gs','utf8');
const doc=fs.readFileSync('src/31_GoogleDocumentoAcademico.gs','utf8');
const editable=fs.readFileSync('src/57_DocumentoEditableClassroom.gs','utf8');
const practice=fs.readFileSync('src/30_PracticaConGoogleDoc.gs','utf8');
const didactic=fs.readFileSync('src/54_DidacticaTransversal.gs','utf8');
const classroom=fs.readFileSync('src/42_SiguienteClaseDraftVisibility.gs','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-apps-script.yml','utf8');
const validate=fs.readFileSync('.github/workflows/validate-minimal-academic-operations.yml','utf8');
const academicWorkflow=fs.readFileSync('.github/workflows/academic-webapp.yml','utf8');
const prune=fs.readFileSync('scripts/prune-apps-script-versions.mjs','utf8');

assert(app.oauthScopes.includes('https://www.googleapis.com/auth/documents'),'DocumentApp scope must be present.');
assert.match(arch,/allowedExamFunctions = new Set\(\['crearExamen','crearExamenDirecto'\]\)/);
assert.doesNotMatch(ctx,/ACADEMIC_REGISTRY_DRIFT|vm\.createContext/);
assert.doesNotMatch(guard,/ACADEMIC_CONTEXT_REGISTRY_DRIFT/);
assert.match(master,/PLANNING_SOURCES_SOURCE: 'ACADEMIC_CONTEXT_CONFIG'/);
assert.match(master,/ACADEMIC_CONTEXT_CONFIG\.planningSources/);
assert.match(web,/COURSE_REGISTRY_SOURCE:'ACADEMIC_CONTEXT_CONFIG'/);
assert.doesNotMatch(web,/COURSES:Object\.freeze\(\{/);
assert.match(attendance,/ACADEMIC_CONTEXT_CONFIG\.courses/);
assert.doesNotMatch(attendance,/COURSE_IDS_2026_JUL_DIC/);

const monitorBody=monitor.slice(monitor.indexOf('function procesarSolicitudesImportacion'),monitor.indexOf('function procesarSolicitudImportacionCalificaciones_'));
assert.doesNotMatch(monitorBody,/SpreadsheetApp|LockService|ejecutarAdaptadorSolicitud_|newTrigger/);
assert.match(monitorBody,/descomisionado:true/);
assert.match(legacy,/function evaluarEntregas\(\)/);
assert.match(legacy,/eliminarTriggersLegacyPorHandler_/);

assert.match(editable,/idsGoogleDocumentosAccesiblesSolicitados_/);
assert.match(editable,/function obtenerMetadataDocumentoClassroom_/);
assert.match(editable,/DocumentApp\\.openById/);
assert.match(editable,/BLOCKED_GOOGLE_DOC_NOT_ACCESSIBLE/);
assert.match(practice,/BLOCKED_GOOGLE_DOC_NOT_ACCESSIBLE/);
assert.doesNotMatch(practice,/documentId obsoleto o inaccesible/);
assert.match(doc,/function renderizarLineasDocumentoAcademico_/);
assert.match(doc,/renderizarTablaPipeDocumento_/);
assert.match(didactic,/'New-Object':/);
assert.match(classroom,/listarCourseWorkPaginaConReintento_/);
assert.match(classroom,/internal error\|server error/);

assert.match(academicWorkflow,/academic-context\.mjs build[\s\S]*academic-context\.mjs check/);
assert.match(deploy,/academic-context\.mjs build[\s\S]*academic-context\.mjs check/);
assert.doesNotMatch(deploy,/^\s*-\s*'scripts\/test-\*\.mjs'/m);
const pushBlock=(validate.match(/push:[\s\S]*?pull_request:/)||[''])[0];
assert.match(pushBlock,/'src\/\*\*'/);
assert.match(pushBlock,/'config\/\*\*'/);
assert.match(pushBlock,/'scripts\/\*\*'/);
assert.doesNotMatch(prune,/method\s*:\s*['"]DELETE['"]/);

console.log('PASS: incident root causes from the 10-day audit are protected by deterministic controls.');

const staticContract=fs.readFileSync('scripts/test-static-webapp-contract.mjs','utf8');
assert.match(staticContract,/STATIC_WEB_APP_SERVICE/);
assert.match(staticContract,/assert-academic-request-data-only/);
assert.match(staticContract,/assert-platform-change-authorized/);
console.log('PASS: static Web App operating model is permanently covered.');
