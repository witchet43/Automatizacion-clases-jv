import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/62_AuditoriaTransversalMaterias.gs','utf8');
assert.doesNotMatch(source,/Classroom\.Courses\.CourseWork\.(create|patch|delete)\s*\(/);
assert.doesNotMatch(source,/(StudentSubmissions\.(patch|return)|SpreadsheetApp\.\w+\.setValues|Gamma\.generate)\s*\(/);

let courseRows=[
  ['ID curso','Nombre','Sección'],
  ['123456789012','UAQ - Curso Ejemplo','Semestre']
];
const taskHeader=['ID curso','Materia','Tema','Título','Instrucciones','Fecha límite',
  'Hora límite','Puntos','Estado solicitud','ID Classroom','Resultado','Fecha procesamiento',
  'Archivo adjunto (Google Doc)','Modo de copia','Tipo de actividad'];
const taskRow=['123456789012','Curso Ejemplo','Unidad 2','Tarea 01 - Preparación',
  '','', '', '100','CREADA','987654321012','','','','','TAREA'];
const quizHeader=['Quiz ID','ID del curso','Nombre del curso','Unidad / tema','ID del tema','Título',
  'Instrucciones','Puntos totales','Estado','Recopilar correo','Limitar a 1 respuesta',
  'Barajar preguntas','ID del Form','URL edición Form','URL responder Form',
  'ID actividad Classroom','URL actividad Classroom','Fecha creación','Última actualización',
  'Resultado / error','Tipo instrumento'];
const quizRow=['EXAM-01','123456789012','','Unidad 1','','Examen 1 - Introducción',
  '','100','ERROR','','','','','','','','','','','Invalid data updating form.','EXAMEN'];
const planHeader=['Sesión','Fecha','Unidad','Tema / subtema','Actividad / práctica vinculada',
  'Documento Google Docs / recurso','Presentación Gamma','Enlace Gamma','Estado de enlace',
  'Tarea previa a esta clase','Tarea siguiente / preparación para la próxima clase'];
const plannedDoc='1AAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const planRows=[[],[],[],[],[],planHeader,
  ['12','01/01/2025','Unidad 2','2.1 Seguridad jurídica',
    'Tarea 01 - Preparación + actividad en clase',
    'https://docs.google.com/document/d/'+plannedDoc+'/edit','2.1 - Seguridad jurídica',
    '','PENDIENTE / No aplica','',''],
  ['13','01/01/2099','Unidad 2','2.2 Seguridad técnica',
    'Actividad 99 - Matriz','',
    '2.2 - Seguridad técnica','','PENDIENTE / No aplica','','']];
const sheet=data=>({getDataRange:()=>({getDisplayValues:()=>data})});
const byName={Cursos:()=>sheet(courseRows),Tareas:()=>sheet([taskHeader,taskRow]),
  Quizzes:()=>sheet([quizHeader,quizRow]),Planeacion:()=>sheet(planRows)};
const works=[{id:'987654321012',title:'Tarea 01 - Preparación',state:'DRAFT',materials:[]},
  {id:'987654321013',title:'Práctica 01 - Documento externo',state:'DRAFT',
    materials:[{driveFile:{driveFile:{id:plannedDoc},shareMode:'VIEW'}}]}];
const ctx={
  MASTER_GUARDRAILS:{PLANNING_SOURCES:{
    'uaq - curso ejemplo':{spreadsheetId:'PLAN',preferredSheet:'Planeacion',
      headerRow:6,columns:{session:'Sesión',unit:'Unidad',topic:'Tema / subtema'}}
  }},
  QUIZ_PIPELINE:{SPREADSHEET_ID:'CONTROL'},
  ACADEMIC_POLICY:{CALENDAR:{DESCRIPTION_FIELDS:['Unidad','Tema/Subtema']}},
  resolvePlanningSource_:name=>{
    const key=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const cfg=ctx.MASTER_GUARDRAILS.PLANNING_SOURCES[key];
    if(!cfg)throw Error('Plan inexistente');
    return cfg;
  },
  SpreadsheetApp:{openById:id=>({getSheetByName:name=>{
    if(id==='PLAN'&&name==='Planeacion')return byName.Planeacion();
    if(id==='CONTROL'&&byName[name])return byName[name]();
    return null;
  }})},
  Classroom:{Courses:{get:id=>({id,name:'UAQ - Curso Ejemplo',courseState:'ACTIVE',
    calendarId:'calendar@example.test'}),
    CourseWork:{list:()=>({courseWork:works})}}},
  Drive:{Files:{get:id=>({id,name:'Documento de actividad',
    mimeType:'application/vnd.google-apps.document',trashed:false,parents:['FOLDER']})}},
  Calendar:{Events:{list:()=>({items:[]})}},
  Utilities:{formatDate:()=> '2026-09-21'},
  console
};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'src/62_AuditoriaTransversalMaterias.gs'});

const byId=ctx.auditarMateriaAcademica('123456789012');
assert.equal(byId.ok,true);
assert.equal(byId.writes,false);
assert.equal(byId.curso.id,'123456789012');
assert.equal(byId.sesiones.length,2);
assert.equal(byId.sesiones[0].gamma.existenciaRemota,'NO_VERIFICADA_POR_ESTA_FUNCION');
const codes=byId.incidencias.map(x=>x.codigo);
assert(codes.includes('GAMMA_DECLARADA_SIN_URL'),'Detecta Gamma declarada sin URL');
assert(codes.includes('DOC_PLANEADO_SIN_ADJUNTO_CLASSROOM'),'Detecta Doc sin vínculo');
assert(codes.includes('GOOGLE_DOC_SIN_STUDENT_COPY'),'Detecta Docs de todos los trabajos');
assert(codes.includes('EVALUACION_REGISTRADA_ERROR'),'Detecta examen ERROR');
assert(byId.incidencias.some(x=>x.codigo==='RECURSO_DECLARADO_NO_LOCALIZADO'&&x.categoria==='PENDIENTE_FUTURO'),'No trata una clase futura como incumplida');
assert.equal(byId.sesiones[0].recursos[0].estados[0],'DRAFT','No equipara CREADA a PUBLISHED');

const byNameResult=ctx.auditarMateriaAcademica('Curso Ejemplo');
assert.equal(byNameResult.curso.id,'123456789012');
const explicit=ctx.auditarMateriaAcademica({materia:'UAQ - Curso Ejemplo',courseId:'123456789012'});
assert.equal(explicit.curso.id,'123456789012');
assert.throws(()=>ctx.auditarMateriaAcademica({materia:'Otra materia',courseId:'123456789012'}),/ID y nombre no corresponden/);
courseRows=courseRows.concat([['999999999999','ITQ - Curso Ejemplo','Semestre']]);
assert.throws(()=>ctx.auditarMateriaAcademica('Curso Ejemplo'),/ambiguo/);
assert.throws(()=>ctx.auditarMateriaAcademica('Curso Desconocido'),/inexistente o ambiguo/);
console.log('Auditoría transversal: pruebas de identidad, Gamma, Docs, Classroom, Forms, futuro y solo lectura OK');
