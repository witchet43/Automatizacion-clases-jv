import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('src/21_NotificacionErrores.gs','utf8');
const attendance=fs.readFileSync('src/64_QuizAsistenciaRapido.gs','utf8');

const extracted=(src,name)=>{
  const marker='function '+name+'(';
  const start=src.indexOf(marker);
  assert.ok(start>=0,'No existe la función '+name);
  const end=src.indexOf('\n}',start);
  assert.ok(end>start,'No termina la función '+name);
  return src.slice(start,end+2);
};

let alerts=0;
const sandbox={notificarErrorScript_(){alerts++;return {notificado:true};}};
vm.createContext(sandbox);

for(const name of [
  'ejecutarConNotificacionError_',
  'errorAcademicoYaNotificadoEnEstaEjecucion_',
  'marcarErrorAcademicoNotificadoEnEstaEjecucion_'
]) vm.runInContext(extracted(source,name),sandbox);

const execute=vm.runInContext('ejecutarConNotificacionError_',sandbox);

assert.throws(
  ()=>execute('EXTERNA',{},()=>execute('INTERNA',{},()=>{throw new Error('Fallo real');})),
  /Fallo real/
);
assert.equal(alerts,1,'Una misma excepción anidada debe generar un solo aviso.');

assert.throws(
  ()=>execute('DISTINTA',{},()=>{throw new Error('Otro fallo');}),
  /Otro fallo/
);
assert.equal(alerts,2,'Errores independientes deben seguir notificándose.');

assert.match(attendance,/function\s+crearQuizAsistenciaRapido\s*\(/);
assert.match(attendance,/crearQuizAsistencia\s*\(/);
assert.doesNotMatch(attendance,/resolverUnidadAbiertaQuizSencillo_|QUIZ_UNIDAD_CERRADA/);

console.log('PASS: fallos independientes notifican; excepciones anidadas solo una vez; Quiz de Asistencia usa su entrypoint canónico.');
