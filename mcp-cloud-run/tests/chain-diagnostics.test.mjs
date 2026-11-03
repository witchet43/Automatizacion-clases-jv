import test from 'node:test';
import assert from 'node:assert/strict';
import {callWebApp,diagnosticPayload} from '../server.mjs';

const config={upstreamUrl:'https://script.google.com/macros/s/TESTDEPLOY/exec'};
const request={action:'diagnosticarFirma',requestId:'probe_synthetic_request_1234567890'};

function mockResponse(status,url,redirected=false,body='{}',type='application/json'){
  return {ok:status>=200&&status<300,status,url,redirected,
    headers:{get:()=>type},text:async()=>body};
}
async function failure(fetcher,body=request,settings=config){
  try{await callWebApp(settings,body,fetcher);}
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
  assert.equal(result.requestIdHint,request.requestId.slice(-12));
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
  assert.equal(result.failedAt,'GITHUB_APP_CONFIG');
  assert.equal(result.nextCheck,'CHECK_OPTIONAL_GITHUB_APP_SETTINGS');
  result=diagnosticPayload(new Error('CLOUD_RUN_VIEWER_ACCESS_OR_API_ERROR: 403'));
  assert.equal(result.failedAt,'CLOUD_RUN_ADMIN_API');
  assert.equal(result.httpStatus,403);
  result=diagnosticPayload(new Error('MCP_CONFIG_REQUIRED: MCP_OAUTH_ISSUER'));
  assert.equal(result.errorCode,'MCP_CONFIG_REQUIRED');
  assert.equal(result.failedAt,'MCP_STARTUP_CONFIG');
  assert.equal(result.phase,'CONFIG_VALIDATION');
  assert.equal(result.configKey,'MCP_OAUTH_ISSUER');
  result=diagnosticPayload(new Error('token=DO_NOT_PRINT'));
  assert.equal(result.errorCode,'MCP_INTERNAL_FAILURE');
  assert.ok(!JSON.stringify(result).includes('DO_NOT_PRINT'));
});

test('authenticated WebApp transport fetches short-lived Google OAuth from existing metadata identity',async()=>{
  const requests=[];
  const secured={...config,webAppAuthMode:'google_oauth'};
  const fetcher=async (url,options)=>{
    requests.push({url,options});
    if(url.startsWith('http://metadata.google.internal/')){
      assert.equal(options.headers['Metadata-Flavor'],'Google');
      assert.match(url,/drive.readonly/);
      return {ok:true,json:async()=>({access_token:'SYNTHETIC_GOOGLE_TOKEN'})};
    }
    assert.equal(url,secured.upstreamUrl);
    assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_GOOGLE_TOKEN');
    return mockResponse(200,url,false,'{"ok":true}');
  };
  const result=await callWebApp(secured,request,fetcher);
  assert.equal(result.ok,true);
  assert.equal(requests.length,2);
});
test('Google WebApp OAuth metadata failures report precise hop without disclosing tokens',async()=>{
  const secured={...config,webAppAuthMode:'google_oauth'};
  const result=await failure(async(url)=>{
    assert.match(url,/metadata.google.internal/);
    return {ok:false,status:403};
  },request,secured);
  assert.equal(result.errorCode,'GOOGLE_WEBAPP_OAUTH_TOKEN_HTTP_403');
  assert.equal(result.failedAt,'CLOUD_RUN_METADATA_SERVER');
  assert.equal(result.httpStatus,403);
});
