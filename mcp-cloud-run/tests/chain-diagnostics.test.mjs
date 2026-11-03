import test from 'node:test';
import assert from 'node:assert/strict';
import {callWebApp,diagnosticPayload} from '../server.mjs';

const config={upstreamUrl:'https://script.google.com/macros/s/TESTDEPLOY/exec'};
const request={action:'diagnosticarFirma',requestId:'probe_synthetic_request_1234567890'};

function mockResponse(status,url,redirected=false,body='{}',type='application/json'){
  return {ok:status>=200&&status<300,status,url,redirected,
    headers:{get:()=>type},text:async()=>body};
}
async function failure(fetcher,body=request){
  try{await callWebApp(config,body,fetcher);}
  catch(e){return diagnosticPayload(e);}
  assert.fail('Expected diagnostic failure');
}
test('HTTP 403 at Apps Script entry identifies hop, status and safe correlation',async()=>{
  const result=await failure(async()=>mockResponse(403,config.upstreamUrl));
  assert.equal(result.errorCode,'UPSTREAM_HTTP_403');
  assert.equal(result.failedAt,'APPS_SCRIPT_WEBAPP_ENTRY');
  assert.equal(result.phase,'GOOGLE_HTTP_RESPONSE');
  assert.equal(result.httpStatus,403);
  assert.equal(result.provider,'GOOGLE_APPS_SCRIPT');
  assert.equal(result.requestIdHint,'_1234567890');
  assert.match(result.diagnosticId,/^[a-f0-9]{16}$/);
  assert.equal(result.nextCheck,'CHECK_WEBAPP_HTTP_ACCESS_AND_REDIRECT');
  assert.ok(!JSON.stringify(result).includes('script.google.com'));
});
test('403 after Google redirect identifies different hop without publishing URL',async()=>{
  const result=await failure(async()=>mockResponse(
    403,'https://script.googleusercontent.com/macros/echo?token=PRIVATE_TOKEN',true));
  assert.equal(result.failedAt,'APPS_SCRIPT_RESPONSE_REDIRECT');
  assert.equal(result.wasRedirected,true);
  assert.equal(result.httpStatus,403);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
});
test('Google sign-in redirect, HTML response and network failures are distinct',async()=>{
  let result=await failure(async()=>mockResponse(403,'https://accounts.google.com/login',true));
  assert.equal(result.failedAt,'GOOGLE_LOGIN_REDIRECT');
  result=await failure(async()=>mockResponse(200,config.upstreamUrl,false,
    '<html>Sign in</html>','text/html'));
  assert.equal(result.errorCode,'UPSTREAM_NON_JSON');
  assert.equal(result.phase,'RESPONSE_DECODE');
  assert.equal(result.responseType,'HTML');
  result=await failure(async()=>{throw Error('connection failed secret=DO_NOT_PRINT');});
  assert.equal(result.errorCode,'WEBAPP_TRANSPORT_FAILURE');
  assert.equal(result.phase,'NETWORK_TRANSPORT');
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
  result=await failure(async()=>{const e=new Error('timeout sensitive');e.name='AbortError';throw e;});
  assert.equal(result.errorCode,'WEBAPP_TRANSPORT_TIMEOUT');
});
test('Apps Script application errors preserve bounded stage and function, not details',async()=>{
  const response=JSON.stringify({ok:false,errorCode:'ACADEMIC_WRITE_AUTH_INVALID',
    error:'Sensitive payload: DO_NOT_PRINT',
    errorDetails:{failedAt:'APPS_SCRIPT_AUTH_CONTEXT',stage:'AUTHORIZATION_OR_CONTEXT',
      sourceLocation:['validateAcademicWriteAuthorization_','not/a/function']}}); 
  const result=await failure(async()=>mockResponse(200,config.upstreamUrl,false,response));
  assert.equal(result.errorCode,'ACADEMIC_WRITE_AUTH_INVALID');
  assert.equal(result.failedAt,'APPS_SCRIPT_AUTH_CONTEXT');
  assert.equal(result.phase,'AUTHORIZATION_OR_CONTEXT');
  assert.deepEqual(result.sourceLocation,['validateAcademicWriteAuthorization_']);
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});
test('GitHub and Cloud Run credential failures remain attributable and sanitized',()=>{
  let result=diagnosticPayload(new Error('GITHUB_APP_CREDENTIALS_NOT_CONFIGURED'));
  assert.equal(result.failedAt,'GITHUB_APP_OR_ACTIONS');
  assert.equal(result.nextCheck,'CHECK_OPTIONAL_GITHUB_APP_SETTINGS');
  result=diagnosticPayload(new Error('CLOUD_RUN_VIEWER_ACCESS_OR_API_ERROR: 403'));
  assert.equal(result.failedAt,'GOOGLE_CLOUD_CONTROL_API');
  assert.equal(result.httpStatus,403);
  result=diagnosticPayload(new Error('token=DO_NOT_PRINT'));
  assert.equal(result.errorCode,'MCP_INTERNAL_FAILURE');
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});
