import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('src/02_ValidacionYUtilidades.gs','utf8');
let mode='VERIFIED',reads=0,writes=0,oneResponse=0,failGet=false;
const ctx={
  console:{error(){}},
  FormApp:{openById:()=>({setLimitOneResponsePerUser:value=>{
    assert.equal(value,true);oneResponse++;
  }})},
  clean_:v=>String(v??'').trim()
};
vm.createContext(ctx);
vm.runInContext(code,ctx);
ctx.formsGet_=()=>{reads++;if(failGet)throw Error('Service not reachable');
  return {settings:{emailCollectionType:mode}};
};
ctx.formsBatchUpdate_=(_id,requests)=>{
 writes++;assert.equal(requests.length,1);
 assert.equal(requests[0].updateSettings.settings.emailCollectionType,'VERIFIED');
 assert.equal(requests[0].updateSettings.updateMask,'emailCollectionType');
};
ctx.configureVerifiedEmail_('FAKE_ID',true);
assert.equal(reads,1);assert.equal(writes,0,'Already VERIFIED requires no update');
assert.equal(oneResponse,1);
mode='RESPONDER_INPUT';
ctx.configureVerifiedEmail_('FAKE_ID',true);
assert.equal(reads,2);assert.equal(writes,1,'Non-VERIFIED must be updated');
assert.equal(oneResponse,2);
mode='DO_NOT_COLLECT';
ctx.configureVerifiedEmail_('FAKE_ID',true);
assert.equal(reads,3);assert.equal(writes,2);
failGet=true;
assert.throws(()=>ctx.configureVerifiedEmail_('FAKE_ID',true),
  /FORMS_VERIFIED_EMAIL_PRECHECK_FAILED/);
assert.equal(writes,2,'No update allowed after failed precheck');
console.log('PASS: verified email precheck skips needless REST POST, requires verification, and fails closed.');
