import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync('src/60_SecuenciaRealClase.gs','utf8');
const planning=fs.readFileSync('src/41_SiguienteClase.gs','utf8');
const ctx={console};
vm.createContext(ctx);
vm.runInContext(script,ctx);
assert.equal(ctx.esSesionExamenPlaneacion_({kind:'Examen de Unidad 2',topic:'3.1 La propiedad intelectual'}),true);
assert.equal(ctx.esSesionExamenPlaneacion_({kind:'Clase ordinaria',topic:'Examen 2'}),true);
assert.equal(ctx.esSesionExamenPlaneacion_({kind:'Clase ordinaria',topic:'3.4 Protección jurídica de datos personales',practice:'Actividad 18'}),false);
assert.equal(ctx.esSesionExamenPlaneacion_({kind:'Actividad integradora',topic:'Repaso para examen',practice:'Actividad 18'}),false);

const rows=[
{session:'22',kind:'Examen',topic:'Examen de la Unidad 2',practice:'Examen 2'},
{session:'23',kind:'Clase ordinaria',topic:'3.1 Propiedad intelectual',practice:'Actividad 23',gamma:'No aplica',gammaState:'NO APLICA'},
{session:'24',kind:'Evaluación de Unidad',topic:'Evaluación final',practice:'Examen 3'},
{session:'25',kind:'Clase ordinaria',topic:'3.2 Software',practice:'Actividad 25',gamma:'No aplica',gammaState:'NO APLICA'}
];
let result=ctx.seleccionarSiguienteClasePorEstadoReal_(rows,[],null,{});
assert.equal(result.target.session,'23','An initial exam must never be proposed as the next class');
assert.equal(result.observed.length,2,'Exam rows are excluded, not treated as missing material');
assert.throws(()=>ctx.seleccionarSiguienteClasePorEstadoReal_(rows,[],'24',{explicitTarget:true}),
 /BLOCKED_UNKNOWN_CANONICAL_SESSION/,'An exam cannot be explicitly created via the class operation');

const existing=[{id:'999',title:'Actividad 23',state:'DRAFT'}];
const notion={source:'NOTION_LIVE_CONNECTOR',status:'LIVE_CANONICAL',pageId:'n23',
 pageUrl:'https://app.notion.com/p/n23',parentPageId:'course',title:'3.1 Propiedad intelectual',
 contentVerified:true,canonicalTopicVerified:true,gammaReferenceVerified:true,
 searchPerformed:true,duplicateCount:1};
const incomplete=ctx.seleccionarSiguienteClasePorEstadoReal_(rows,existing,null,{notionLiveEvidence:{'23':notion}});
assert.equal(incomplete.target.session,'23','Ordinary class without LIVE Gamma is incomplete even if planning says NO APLICA');
const gamma={source:'GAMMA_LIVE_CONNECTOR',status:'LIVE_ACTIVE_CANONICAL',
 gammaId:'g23',gammaUrl:'https://gamma.app/docs/g23',title:rows[1].topic,
 archived:false,contentVerified:true,canonicalTopicVerified:true,
 searchPerformed:true,activeEquivalentFound:false};
result=ctx.seleccionarSiguienteClasePorEstadoReal_(rows,existing,null,{
 notionLiveEvidence:{'23':notion},gammaLiveEvidence:{'23':gamma}});
assert.equal(result.target.session,'25','The next ordinary session after a completed class and exam is selected');
assert.equal(result.observed.length,2);

const start=planning.indexOf('function leerPlaneacionSiguienteClase_(');
const end=planning.indexOf('function tituloTareaPreviaClase_',start);
assert.ok(start>=0&&end>start);
ctx.normalizeGuard_=v=>String(v??'').trim().toLowerCase().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
ctx.findHeaderGuard_=(headers,candidates)=>{for(const c of candidates){
 const i=headers.indexOf(ctx.normalizeGuard_(c));if(i>=0)return i;
}return-1};
ctx.resolvePlanningSource_=()=>({spreadsheetId:'test',preferredSheet:'Planeación',headerRow:1,
 columns:{session:'Sesión',unit:'Unidad',topic:'Tema / subtema'}});
ctx.SpreadsheetApp={openById:()=>({getSheetByName:()=>({
 getDataRange:()=>({getDisplayValues:()=>[
 ['Sesión','Unidad','Tema / subtema','Tipo de sesión'],
 ['22','Unidad 2','Examen 2','Examen'],
 ['23','Unidad 3','3.1 Propiedad intelectual','Clase ordinaria']
 ]}),getName:()=> 'Planeación'}),getSheets:()=>[]})};
vm.runInContext(planning.slice(start,end),ctx);
const planned=ctx.leerPlaneacionSiguienteClase_('Ética y Legislación Informática');
assert.equal(planned.rows[0].kind,'Examen');
assert.equal(planned.rows[1].kind,'Clase ordinaria');
assert.equal(ctx.esSesionExamenPlaneacion_(planned.rows[0]),true);
console.log('PASS: exam session rows omitted from class selection and explicit-class targeting, actual session type parsed from planning; examination workflow unaffected.');
