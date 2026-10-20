import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/66_MantenimientoPropiedadesAcademicas.gs','utf8');
const key=k=>'SIMPLE_QUIZ_REQUEST_'+k.repeat(64);
const all=new Map([
 ['ACADEMIC_WRITE_HMAC_KEY','secretvalue_dev_only_1234567890_abcd'],
 ['ACADEMIC_WRITE_RECEIPT_123',JSON.stringify({status:'PENDING'})],
 [key('a'),JSON.stringify({workId:'1234567890'})],
 [key('b'),'NOT_JSON'],
 [key('c'),JSON.stringify({foo:'bar'})],
 ['OTHER_INTEGRATION_KEY','protected']
]);
let held=false;
let operations=0;
const logs=[];
const sandbox={
  console:{log:value=>logs.push(String(value))},
  PropertiesService:{getScriptProperties:()=>({
    getProperties:()=>Object.fromEntries(all),
    deleteProperty:k=>{operations++;all.delete(k)}
  })},
  LockService:{getScriptLock:()=>({
    tryLock:()=>{if(held)return false;held=true;return true},
    releaseLock:()=>{held=false}
  })}
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const summary=sandbox.diagnosticarPropiedadesAcademicas();
assert.equal(summary.clavesQuizSencillo,3);
assert.equal(summary.recibosPendientes,1);
assert.equal(summary.claveHmacConfigurada,true);
assert.equal(operations,0);
const cleaned=sandbox.depurarSolicitudesQuizSinReferencia();
assert.equal(cleaned.eliminadasSinReferencia,2);
assert.equal(cleaned.preservadasPorIdempotencia,1);
assert.equal(held,false);
assert.equal(all.has(key('a')),true);
assert.equal(all.has(key('b')),false);
assert.equal(all.has(key('c')),false);
assert.equal(all.has('ACADEMIC_WRITE_RECEIPT_123'),true);
assert.equal(all.has('ACADEMIC_WRITE_HMAC_KEY'),true);
assert.equal(all.has('OTHER_INTEGRATION_KEY'),true);
assert.ok(!logs.join(' ').includes('secretvalue_'));
assert.ok(!logs.join(' ').includes(key('a')));
console.log('PASS: script properties >50-safe diagnostics, protects HMAC + receipts and preserves valid quiz idempotency');
