import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('src/63_AuditarYCompletarMateria.gs','utf8');
const didactica=fs.readFileSync('src/54_DidacticaTransversal.gs','utf8');
const didCtx={ACADEMIC_POLICY:{CLASSROOM:{DIDACTIC_INSTRUCTIONS:{
  PERSONAL_WINDOWS_DEVICE:true,EXPLAIN_COMMANDS:true,REMOVE_ADMINISTRATIVE_TEXT:true
}}}};
vm.createContext(didCtx);
vm.runInContext(didactica,didCtx,{filename:'src/54_DidacticaTransversal.gs'});
const originalFormat='INDICACIONES PARA EL ALUMNO\\n\\nTrabaja en tu documento.\\n\\nDESARROLLO\\n\\n1. Registra resultados.\\n\\nEVIDENCIA DE ENTREGA\\n\\nTabla.';
const formatted=didCtx.normalizarInstruccionesDidacticas_(originalFormat,'PRACTICA');
assert(formatted.startsWith('INDICACIONES PARA EL ALUMNO\\n\\nUtiliza tu computadora personal con Windows.'),
  'La guía Windows debe añadirse DESPUÉS del encabezado, nunca antes');
assert.equal(didCtx.normalizarInstruccionesDidacticas_(formatted,'PRACTICA'),formatted,'Normalización histórica idempotente');

assert.doesNotMatch(code,/StudentSubmissions\.(?:patch|return)|assignedGrade\s*:/);
assert.doesNotMatch(code,/CourseWork\.(?:create|patch|delete)\s*\(/);
assert.doesNotMatch(code,/Gamma\.generate|GAMMA_API_KEY/);
const doc='1AAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
let works=[],created=0,readCount=0;
const row={session:'12',date:'02/09/2026',time:'17:00–19:00',
  unit:'Unidad 2',topic:'2.1 Seguridad jurídica',
  practice:'Tarea 01 - Seguridad jurídica en un entorno digital + actividad en clase',
  practiceDescription:'Analiza individualmente situaciones digitales; distingue fundamento, autorización, límites y certeza jurídica con casos del documento.',
  evidence:'Completa la matriz de seguridad jurídica y justifica por escrito cada respuesta.',
  gamma:'2.1 - Seguridad jurídica',gammaUrl:'',
  documento:'https://docs.google.com/document/d/'+doc+'/edit'};
const session={sesion:'12',documento:{id:doc,url:row.documento,courseWorkIds:[]},recursos:[]};
const ctx={
  Date,console,
  Utilities:{formatDate:(date,tz,format)=>format==='yyyy-MM-dd'?'2026-09-22':'21:00'},
  auditoriaResolverIdentidad_:()=>({courseId:'123456789012',
    materiaCanonica:'UAQ - Curso Ejemplo',nombre:'UAQ - Curso Ejemplo'}),
  auditarMateriaAcademica:()=>{readCount++;return {sesiones:[Object.assign({},session,{
    documento:Object.assign({},session.documento,{courseWorkIds:works.map(w=>String(w.id))})})],
    incidencias:[],resumen:{},cobertura:{}};},
  leerPlaneacionSiguienteClase_:()=>({rows:[row]}),
  resolvePlanningSource_:()=>({spreadsheetId:'plan',preferredSheet:'Planeacion'}),
  auditoriaLeerPlan_:()=>({rows:[{sesion:'12',actividadDia:'Matriz de seguridad jurídica - Aplicación 2.1'}]}),
  auditoriaFechaCanonica_:v=>/^\d{4}-\d\d-\d\d$/.test(String(v))?v:(String(v).split('/').reverse().join('-')),
  auditoriaNormalizar_:v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),
  auditoriaClaveRecurso_:v=>String(v||'').toLowerCase().trim().replace(/^(práctica|practica)\s+0*([1-9]\d*)/,(_,t,n)=>'practica '+Number(n)),
  QUIZ_PIPELINE:{SPREADSHEET_ID:'CONTROL'},
  SpreadsheetApp:{openById:()=>({})},
  auditoriaLeerRegistros_:()=>[],
  auditoriaExtraerDocId_:v=>((String(v).match(/\/document\/d\/([-\w]{15,})/)||[])[1]||''),
  auditoriaEsMarcador_:v=>!v||/^(pendiente|no aplica)/i.test(v),
  auditoriaListarCourseWork_:()=>works,
  Classroom:{Courses:{get:id=>({id}),CourseWork:{get:(id,wid)=>works.find(w=>String(w.id)===wid)}}},
  Drive:{Files:{get:id=>({id,name:'Matriz 2.1',mimeType:'application/vnd.google-apps.document',trashed:false})}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  assertAcademicAutomationWriteEnabled_:()=>true,
  verificarTodosLosGoogleDocsEnClassroom_:(w,ids)=>{assert.equal(w.materials[0].driveFile.shareMode,'STUDENT_COPY');assert.equal(w.materials[0].driveFile.driveFile.id,ids[0]);},
  crearActividadReconciliacionHistorica:p=>{created++;assert.equal(p.reconciliationMode,true);
    assert.equal(p.explicitSequenceOverride,true);
    assert.equal(p.sesionCanonica,12);
    assert.equal(p.documentId,doc);
    works.push({id:'987654321012',title:p.titulo,state:'DRAFT',
      materials:[{driveFile:{driveFile:{id:doc},shareMode:'STUDENT_COPY'}}]});
    return {workId:'987654321012',reutilizado:false};},
  crearPractica:()=>{throw Error('No debe ejecutar práctica');},
  asegurarCopiasDocumentosBorrador_:()=>{throw Error('No debe reparar si ya existe');}
};
vm.createContext(ctx);
vm.runInContext(code,ctx,{filename:'src/63_AuditarYCompletarMateria.gs'});
assert.equal(ctx.completacionSesionConcluida_({date:'23/09/2026',time:'17:00–19:00'},new Date()).ok,false);
assert.equal(ctx.completacionSesionConcluida_({date:'21/09/2026',time:'17:00–19:00'},new Date()).ok,true);
const first=ctx.auditarYCompletarMateriaAcademica('123456789012');
assert.equal(first.creadosOReparados.length,1);
assert.equal(first.creadosOReparados[0].estado,'DRAFT');
assert(first.bloqueados.some(x=>x.codigo==='GAMMA_SIN_URL_REQUIERE_INVENTARIO_REMOTO'));
assert.equal(created,1);
const second=ctx.auditarYCompletarMateriaAcademica('123456789012');
assert.equal(second.creadosOReparados.length,0,'Reintento idempotente');
assert.equal(created,1);
assert.equal(readCount,4,'Reaudita al cierre de ambas ejecuciones');
console.log('Auditoría y completación: sesión histórica, creación DRAFT con copia, sin Gamma duplicada e idempotencia OK');
