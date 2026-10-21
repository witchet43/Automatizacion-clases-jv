import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Reproduce the UAQ ethics classes' recurrent false rejection without any
// Google API calls, files, class creation or additional runtime checks.
const ctx={console};
vm.createContext(ctx);
for(const name of ['src/31_GoogleDocumentoAcademico.gs','src/30_PracticaConGoogleDoc.gs']){
  vm.runInContext(fs.readFileSync(name,'utf8'),ctx,{filename:name});
}
const title='Proyecto MiPyME - Ficha 02 - Diagnóstico';
const longProse=(
 'En un contrato de desarrollo a medida se documentan obligaciones y evidencia de entrega; '+
 'la organización conserva su análisis sin afirmar derechos o procesos internos no verificables. '+
 'El desarrollo del expediente permite clasificar la información pública y los riesgos. '
).repeat(7);
assert.ok(longProse.length>450);
const paragraphs=[
 'INDICACIONES PARA EL ALUMNO',
 'Utiliza tu computadora personal con Windows.',
 'DESARROLLO',
 'OBJETIVO',
 longProse,
 'EVIDENCIA DE ENTREGA',
 'Entrega una matriz con fuentes públicas.'
];
const html=ctx.construirHtmlPractica_(title,'',paragraphs);
assert.match(html,/<h1>Proyecto MiPyME/);
assert.match(html,/<h2>Desarrollo<\/h2>/);
assert.match(html,/desarrollo a medida/);
assert.match(html,/evidencia de entrega/);
assert.doesNotThrow(()=>ctx.validarFormatoHtmlDocumentoAcademico_(html,title),
 'Normal subject matter in long prose must not be treated as a malformed section heading');

const taskHtml=ctx.construirHtmlDocumentoAcademico_(
 'Tarea sobre tipos de contratos','',[
 'INDICACIONES PARA EL ALUMNO','DESARROLLO','CASOS',longProse,
 'EVIDENCIA DE ENTREGA','Tabla razonada'
 ]);
assert.doesNotThrow(()=>ctx.validarFormatoHtmlDocumentoAcademico_(taskHtml,'Tarea sobre tipos de contratos'));

const malformed='<h1>Práctica</h1><p>DESARROLLO: '+('explicación sin saltos '.repeat(36))+'</p>';
assert.ok(malformed.length>450);
assert.throws(()=>ctx.validarFormatoHtmlDocumentoAcademico_(malformed,'Práctica'),
 /BLOCKED_DOCUMENT_FORMAT_FLAT_BLOCK/,
 'Actually flattened structural headings still fail before any Drive creation');
assert.throws(()=>ctx.validarFormatoHtmlDocumentoAcademico_('<p>Sin título</p>','Práctica'),
 /BLOCKED_DOCUMENT_FORMAT/,
 'Real missing document structure remains protected');
console.log('PASS: long academic prose about development/evidence renders correctly in practice and task; only genuine malformed structural blocks are rejected.');
