#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const source = read('src/60_SecuenciaRealClase.gs');
const resolver = read('src/41_SiguienteClase.gs');
const generator = read('src/44_NomenclaturaRecursos.gs');
const guards = read('src/39_MasterGuardrails.gs');
const policy = read('src/00_PoliticasCanonicas.gs');
const ctx = {console};
vm.createContext(ctx);
vm.runInContext(source, ctx, {filename:'60_SecuenciaRealClase.gs'});
assert.equal(ctx.validarSecuenciaRealRegresion().ok, true);

const resolverCode = resolver.slice(resolver.indexOf('function resolverSiguienteClase('), resolver.indexOf('function crearTareaPaquete_('));
const generatorCode = generator.slice(generator.indexOf('function generarSiguienteClase('), generator.indexOf('function generarSiguienteClaseSistemasDistribuidos('));
assert.doesNotMatch(resolverCode, /PropertiesService|getProperty|new Date|Date\.now|fechaIsoPlaneacion_/);
assert.doesNotMatch(generatorCode, /PropertiesService|getProperty|setProperty|new Date|Date\.now/);
assert.match(resolverCode, /seleccionarSiguienteClasePorEstadoReal_/);
assert.match(generatorCode, /resolverSiguienteClase\(/);
assert.match(generatorCode, /BLOCKED_UNSUPPORTED_CLASS_GENERATOR/);
assert.match(guards, /const real = isClassPackage \? resolverSiguienteClase\(/);
assert.match(policy, /SOURCE:\s*'CLASSROOM_GAMMA_REAL_STATE'/);
assert.match(policy, /SYSTEM_DATE_AS_PROGRESS:\s*false/);
assert.match(policy, /SAVED_COUNTER_AS_PROGRESS:\s*false/);

// El estado de las fuentes se simula. Ningún reloj o propiedad de progreso
// existe en el entorno; consultar cualquiera de ellos falla la prueba.
const headings = ['Sesión','Fecha','Unidad','Tema / subtema','Actividad / práctica vinculada','Enlace Gamma','Estado de enlace','ID / estado Classroom'];
const data=[
  headings,
  ['12','02/09/2026','Unidad 2','2.1 Seguridad jurídica','Actividad 5','https://gamma.app/docs/demo-12','Gamma generado y verificado','Actividad 5: 100000000001 (PUBLISHED)'],
  ['13','07/09/2026','Unidad 2','2.2 Seguridad técnica','Actividad 6','https://gamma.app/docs/demo-13','Gamma generado y verificado','Actividad 6: 100000000002 (DRAFT)'],
  ['14','09/09/2026','Unidad 2','2.3 Riesgos informáticos','Actividad 7','','',''],
  ['15','21/09/2026','Unidad 2','2.4 Clasificación de los riesgos','Actividad 8','','','']
];
const works=[
  {id:'100000000001',title:'Actividad 5',state:'PUBLISHED'},
  {id:'100000000002',title:'Actividad 6',state:'DRAFT'}
];
ctx.normalizeGuard_ = v => String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
ctx.findHeaderGuard_ = (headers,candidates) => {
  for (const candidate of candidates) {
    const index=headers.indexOf(ctx.normalizeGuard_(candidate));
    if (index>=0) return index;
  }
  return -1;
};
ctx.resolvePlanningSource_=()=>({spreadsheetId:'CONTROL_PRUEBA',preferredSheet:'Planeación'});
ctx.SpreadsheetApp={openById:()=>({
  getSheetByName:()=>({getDataRange:()=>({getDisplayValues:()=>data}),getName:()=> 'Planeación'}),
  getSheets:()=>[]
})};
ctx.Classroom={Courses:{
  list:()=>({courses:[{id:'CURSO_PRUEBA',name:'UAQ - Ética y Legislación Informática'}]}),
  CourseWork:{list:()=>({courseWork:works}),create:()=>{throw Error('PROHIBIDO_CREAR_EN_REGRESION');}}
}};
ctx.PropertiesService={getScriptProperties:()=>{throw Error('PROHIBIDO_USAR_CONTADOR_GUARDADO');}};
ctx.Date=class extends Date {constructor(){throw Error('PROHIBIDO_USAR_FECHA_ACTUAL');}static now(){throw Error('PROHIBIDO_USAR_RELOJ');}};
vm.runInContext(resolver,ctx,{filename:'41_SiguienteClase.gs'});
let state=ctx.resolverSiguienteClase('UAQ - Ética y Legislación Informática');
assert.equal(state.target.session,'13');
assert.equal(state.sequenceSource,'CLASSROOM_GAMMA_REAL_STATE');
assert.equal(state.evidence.gammaVerificada,true);
assert.equal(state.evidence.publicado,false);

// Aunque el ordenador esté en cualquier fecha, solo cambian los recursos reales.
data[3][5]='https://gamma.app/docs/demo-14';
data[3][6]='Gamma generado y verificado';
data[3][7]='Actividad 7: 100000000003 (DRAFT)';
works.push({id:'100000000003',title:'Actividad 7',state:'DRAFT'});
state=ctx.resolverSiguienteClase('UAQ - Ética y Legislación Informática');
assert.equal(state.target.session,'13');
assert.equal(state.progress.lastPublished,0); // 2.2 y 2.3 están preparadas, NO publicadas.
works[1].state='PUBLISHED';
state=ctx.resolverSiguienteClase('UAQ - Ética y Legislación Informática');
assert.equal(state.target.session,'14');
assert.equal(state.evidence.publicado,false);
works[2].state='PUBLISHED';
state=ctx.resolverSiguienteClase('UAQ - Ética y Legislación Informática');
assert.equal(state.target.session,'15');
vm.runInContext(generator,ctx,{filename:'44_NomenclaturaRecursos.gs'});
assert.throws(()=>ctx.generarSiguienteClase({materia:'UAQ - Ética y Legislación Informática'}),/BLOCKED_UNSUPPORTED_CLASS_GENERATOR/);
console.log('OK: selección por evidencia Classroom/Gamma; huecos, DRAFT ≠ PUBLISHED, sin fecha ni contadores, preflight y materia segura.');
