import test from 'node:test';
import assert from 'node:assert/strict';
import {callWebApp,diagnosticPayload} from '../server.mjs';

const config={
  academicTransport:'script_api',
  googleOAuthUser:{
    clientId:'123-demo.apps.googleusercontent.com',
    clientSecret:'SYNTHETIC_CONFIDENTIAL_CLIENT_SECRET',
    refreshToken:'SYNTHETIC_REFRESH_TOKEN_DO_NOT_DISCLOSE',
    executionDeploymentId:'AKfycbwABCDEFGHIJKLMNOPabcdefghijkl0123456'
  }
};
const request={action:'diagnosticarFirma',requestId:'read_safe_example_1234567890123'};
async function getFailure(fetcher,settings=config){
  try{await callWebApp(settings,request,fetcher);}catch(e){return diagnosticPayload(e);}
  assert.fail('Expected callScriptApi to fail safely');
}
test('existing API Executable receives authenticated, HMAC-bearing JSON without leak',async()=>{
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push(url);
    if(url==='https://oauth2.googleapis.com/token'){
      assert.equal(init.method,'POST');
      assert.match(String(init.body),/grant_type=refresh_token/);
      return new Response(JSON.stringify({access_token:'SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN'}),{status:200});
    }
    assert.match(url,/^https:\/\/script\.googleapis\.com\/v1\/scripts\/AKfy/);
    assert.equal(init.headers.Authorization,'Bearer SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN');
    const payload=JSON.parse(init.body);
    assert.equal(payload.function,'ejecutarServicioAcademicoApi');
    assert.deepEqual(payload.parameters,[request]);
    return new Response(JSON.stringify({response:{result:{ok:true,action:'diagnosticarFirma',signatureAccepted:true}}}),{status:200});
  };
  const result=await callWebApp(config,request,fetcher);
  assert.equal(result.signatureAccepted,true);
  assert.equal(calls.length,2);
});
test('Secret Manager OAuth values strip surrounding paste whitespace only',async()=>{
  const settings={...config,googleOAuthUser:{...config.googleOAuthUser,
    clientId:'  '+config.googleOAuthUser.clientId+'\n',
    clientSecret:config.googleOAuthUser.clientSecret+'\n',
    refreshToken:'  '+config.googleOAuthUser.refreshToken+'\n'}};
  const fetcher=async (url,init)=>{
    if(url.includes('oauth2.googleapis.com')){
      const body=new URLSearchParams(init.body);
      assert.equal(body.get('client_id'),config.googleOAuthUser.clientId);
      assert.equal(body.get('client_secret'),config.googleOAuthUser.clientSecret);
      assert.equal(body.get('refresh_token'),config.googleOAuthUser.refreshToken);
      return new Response('{"access_token":"SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN"}',{status:200});
    }
    return new Response('{"response":{"result":{"ok":true}}}',{status:200});
  };
  assert.equal((await callWebApp(settings,request,fetcher)).ok,true);
});
test('OAuth refresh error identifies Google RFC category without sensitive details',async()=>{
  const d=await getFailure(async()=>new Response(JSON.stringify({
    error:'invalid_grant',
    error_description:'SECRET_DESCRIPTION_WITH_PRIVATE_EMAIL'
  }),{status:400}));
  assert.equal(d.errorCode,'GOOGLE_USER_OAUTH_REFRESH_INVALID_GRANT');
  assert.equal(d.failedAt,'GOOGLE_OAUTH_TOKEN_ENDPOINT');
  assert.equal(d.httpStatus,400);
  assert.equal(d.nextCheck,'REAUTHORIZE_GOOGLE_REFRESH_TOKEN');
  const encoded=JSON.stringify(d);
  assert.ok(!encoded.includes('SYNTHETIC_CONFIDENTIAL'));
  assert.ok(!encoded.includes('SYNTHETIC_REFRESH_TOKEN'));
  assert.ok(!encoded.includes('PRIVATE_EMAIL'));
});
test('OAuth refresh invalid_client directs to exact credential pair',async()=>{
  const d=await getFailure(async()=>new Response('{"error":"invalid_client"}',{status:401}));
  assert.equal(d.errorCode,'GOOGLE_USER_OAUTH_REFRESH_INVALID_CLIENT');
  assert.equal(d.nextCheck,'VERIFY_GOOGLE_OAUTH_CLIENT_ID_SECRET_PAIR');
});
test('Unknown Google OAuth errors do not reveal untrusted provider text',async()=>{
  const d=await getFailure(async()=>new Response('{"error":"stolen_token_ABC"}',{status:400}));
  assert.equal(d.errorCode,'GOOGLE_USER_OAUTH_REFRESH_UNKNOWN');
  assert.ok(!JSON.stringify(d).includes('stolen_token_ABC'));
});
test('execution API Google permission denial locates the exact hop',async()=>{
  const d=await getFailure(async url=>url.includes('oauth2.googleapis.com')
    ?new Response('{"access_token":"SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN"}',{status:200})
    :new Response('{"error":{"message":"SECRET_SAMPLE"}}',{status:403}));
  assert.equal(d.errorCode,'APPS_SCRIPT_EXECUTION_API_HTTP_403');
  assert.equal(d.failedAt,'APPS_SCRIPT_EXECUTION_API');
  assert.equal(d.phase,'GOOGLE_API_RESPONSE');
  assert.ok(!JSON.stringify(d).includes('SECRET_SAMPLE'));
});
test('Apps Script error response preserves only safe code/stage/function',async()=>{
  const result={response:{result:{ok:false,errorCode:'ACADEMIC_WRITE_AUTH_INVALID',
    errorDetails:{failedAt:'APPS_SCRIPT_AUTH_CONTEXT',stage:'AUTHORIZATION_OR_CONTEXT',
      sourceLocation:['validateAcademicWriteAuthorization_']},
    error:'PRIVATE_STUDENT_DATA_SHOULD_NOT_LEAK'}}};
  const d=await getFailure(async url=>url.includes('oauth2.googleapis.com')
    ?new Response('{"access_token":"SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN"}',{status:200})
    :new Response(JSON.stringify(result),{status:200}));
  assert.equal(d.errorCode,'ACADEMIC_WRITE_AUTH_INVALID');
  assert.equal(d.failedAt,'APPS_SCRIPT_AUTH_CONTEXT');
  assert.equal(d.phase,'AUTHORIZATION_OR_CONTEXT');
  assert.deepEqual(d.sourceLocation,['validateAcademicWriteAuthorization_']);
  assert.ok(!JSON.stringify(d).includes('PRIVATE_STUDENT_DATA'));
});
test('execution API exceptional response remains redacted',async()=>{
  const d=await getFailure(async url=>url.includes('oauth2.googleapis.com')
    ?new Response('{"access_token":"SYNTHETIC_GOOGLE_OWNER_ACCESS_TOKEN"}',{status:200})
    :new Response(JSON.stringify({error:{message:'SENSITIVE_INTEGRATION_DETAILS'}}),{status:200}));
  assert.equal(d.errorCode,'APPS_SCRIPT_EXECUTION_API_RUNTIME_ERROR');
  assert.ok(!JSON.stringify(d).includes('SENSITIVE_INTEGRATION_DETAILS'));
});
