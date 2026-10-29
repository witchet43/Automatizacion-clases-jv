import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const seq=fs.readFileSync('src/60_SecuenciaRealClase.gs','utf8');
const sandbox={console};
vm.createContext(sandbox);
vm.runInContext(seq,sandbox,{filename:'60_SecuenciaRealClase.gs'});

const rows=[
 {session:'16',unit:'Unidad 2',topic:'2.2.5 Mensajes de respuesta HTTP',
  practice:'Práctica 15 - Interpretar códigos y mensajes de respuesta HTTP',
  gammaUrl:'https://gamma.app/docs/225-Mensajes-de-respuesta-HTTP-demo',
  gammaState:'GENERADA Y VERIFICADA'},
 {session:'17',unit:'Unidad 2',topic:'2.2.6 Estado usuario-servidor',
  practice:'Práctica 16 - Observar cookies y estado de sesión'},
 {session:'18',unit:'Unidad 2',topic:'2.3 Programación de socket con TCP',
  practice:'Práctica 17 - Programar un cliente y servidor TCP'},
 {session:'19',unit:'Unidad 2',
  topic:'2.4 Programación de socket con UDP + 2.5 Construcción de un servidor Web',
  practice:'Práctica 18 - Comparar UDP con un servidor web mínimo'}
];
const works=[
 {id:'888137102579',title:rows[0].practice,state:'PUBLISHED'},
 {id:'893237625248',title:rows[1].practice,state:'PUBLISHED'},
 {id:'895313209194',title:rows[2].practice,state:'PUBLISHED'}
];

let next=sandbox.seleccionarSiguienteClasePorEstadoReal_(rows,works);
assert.equal(next.target.session,'19','La sesión siguiente no debe retroceder a la clase 16');
assert.equal(next.source,'CLASSROOM_PUBLISHED_PROGRESS');
assert.equal(next.gammaVerificationOnly,false);
assert.equal(next.notionVerificationOnly,false);
assert.ok(next.historicalBacklog.some(x=>x.session==='16'&&!x.gammaReady));
assert.ok(next.historicalBacklog.some(x=>x.session==='18'&&!x.notionReady));
assert.equal(next.evidence.recursoPreparado,false);

// Una sesión parcialmente preparada se termina sin duplicar su identidad.
works.push({id:'896603794112',title:rows[3].practice,state:'DRAFT'});
next=sandbox.seleccionarSiguienteClasePorEstadoReal_(rows,works);
assert.equal(next.target.session,'19');
assert.equal(next.evidence.recursoPreparado,true);
assert.equal(next.evidence.paquetePreparado,false);

// Nunca tratar la URL histórica de Gamma como prueba LIVE de existencia.
assert.equal(next.observed[0].gammaVerificada,false);

// La sesión explícita permanece canónica y no se desplaza al día actual.
const explicit=sandbox.seleccionarSiguienteClasePorEstadoReal_(
  rows,works,'19',{explicitTarget:true});
assert.equal(explicit.target.session,'19');
assert.equal(explicit.source,'EXPLICIT_CANONICAL_SESSION');

// Cuando la clase se haya impartido no se vuelve a generar aunque
// Gamma/Notion estén pendientes: la deuda queda inventariada.
works[works.length-1].state='PUBLISHED';
next=sandbox.seleccionarSiguienteClasePorEstadoReal_(rows,works);
assert.equal(next.complete,true);
assert.equal(next.source,'CLASSROOM_PUBLISHED_PROGRESS');
assert.ok(next.historicalBacklog.some(x=>x.session==='19'));

const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
assert.match(web,/payload\.sesionCanonica=canonicalSession/);
assert.match(web,/payload\.explicitSequenceOverride=true/);
assert.match(web,/resourceRepairPending:resourcePhaseStatus==='PARCIAL'/);
assert.match(web,/writeOutcome:'RECONCILE_BEFORE_RETRY'/);
assert.match(web,/requiresContent\.length&&!pending\.length/);
assert.match(web,/pending\.forEach\(function\(item\)/);
console.log('OK: progreso publicado adelanta y registra backlog; ejecución parcial aislada por recurso.');
