import assert from 'node:assert/strict';
import {readContext} from './academic-context.mjs';

// Live negative authorization probe: anonymous HTTP transport is permitted,
// but NO unsigned action may succeed. Do not call Classroom or modify data.
// A valid signed HMAC E2E must separately be confirmed by MCP gateway_status.
const {manifest,digest}=readContext();
const response=await fetch(manifest.webApp.url,{
  method:'POST',
  headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:JSON.stringify({action:'diagnosticarFirma'}),
  redirect:'follow',
  signal:AbortSignal.timeout(30000)
});
if(!response.ok)
  throw Error('WEBAPP_HTTP_ENTRY_FAILURE_'+response.status);
const contentType=String(response.headers.get('content-type')||'');
if(contentType.toLowerCase().includes('text/html'))
  throw Error('WEBAPP_RETURNED_HTML_NOT_APPS_SCRIPT_JSON');
let data;
try{data=await response.json();}
catch{throw Error('WEBAPP_RETURNED_NON_JSON');}
assert.equal(data?.ok,false,'Unsigned diagnostic must not succeed');
assert.equal(data?.errorCode,'ACADEMIC_HMAC_DIAGNOSTIC_INVALID',
  'Expected canonical doPost validation, not a Google sign-in page');
assert.ok(manifest.webApp.url.startsWith('https://script.google.com/'));
console.log(JSON.stringify({
  ok:true,transport:'PUBLIC_HTTP_WITH_MANDATORY_SIGNED_HMAC',
  anonymousHttpEntryReached:true,unsignedActionRejected:true,
  errorCode:data.errorCode,manifestSha256:digest,
  signedHmacTested:false,classroomContacted:false,
  validAcademicWritesSent:0,resourcesCreated:0
}));