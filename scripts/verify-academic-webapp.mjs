import assert from 'node:assert/strict';
import {prepareRequest,readContext} from './academic-context.mjs';
const {manifest,digest}=readContext();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function post(request){
  let last=null;
  for(let attempt=0;attempt<5;attempt++){
    const response=await fetch(manifest.webApp.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
    last=response;
    if(response.ok){
      const raw=await response.text();
      if(/^\s*</.test(raw))throw Error('WEB_APP_AUTHORIZATION_REQUIRED');
      try{return JSON.parse(raw);}catch{throw Error('WEB_APP_INVALID_JSON_RESPONSE');}
    }
    if([404,429,500,502,503,504].includes(response.status)&&attempt<4){await sleep(1000*(attempt+1));continue;}
    if(response.status===403){
      // Observe the final HTTP hop without logging the URL or any token.
      let hop='UNKNOWN_HTTP_GATE';
      try{
        const host=new URL(response.url).hostname.toLowerCase();
        if(host==='script.google.com')hop='SCRIPT_GOOGLE_COM_ENTRY';
        else if(host==='script.googleusercontent.com')hop='SCRIPT_GOOGLEUSERCONTENT_REDIRECT';
        else if(host==='accounts.google.com')hop='GOOGLE_LOGIN_REDIRECT';
        else hop='UNEXPECTED_HTTP_DESTINATION';
      }catch{}
      throw Error('WEB_APP_AUTHORIZATION_REQUIRED_AT_'+hop);
    }
    throw Error('WEB_APP_HEALTH_HTTP_'+response.status);
  }
  throw Error('WEB_APP_HEALTH_HTTP_'+String(last&&last.status||'UNKNOWN'));
}
const missing=await post({action:'uaqExecutor',operation:'clase',materia:'Administración',params:{resources:[]}});
assert.equal(missing.ok,false);assert.equal(missing.error,'ACADEMIC_CONTEXT_REQUIRED');
assert.equal(missing.errorDetails?.failedAt,'APPS_SCRIPT_AUTH_CONTEXT',
  'WebApp health response must identify the failing execution component');
assert.equal(missing.errorDetails?.provider,'GOOGLE_APPS_SCRIPT');
// Health verification may only exercise rejected requests. Live Classroom
// diagnostics are performed directly by the private Site, never by Actions.
const empty=prepareRequest({action:'uaqExecutor',operation:'clase',requestId:'deployment-negative-auth-check',materia:'Administración',params:{resources:[]}});
const dispatch=await post(empty.request);
assert.equal(dispatch.ok,false);
if(dispatch.error==='ACADEMIC_CONTEXT_MISMATCH')throw Error('DEPLOYED_WEBAPP_MANIFEST_DRIFT');
assert.equal(dispatch.error,'ACADEMIC_WRITE_AUTH_REQUIRED');
const direct=await post({...empty.request,action:'clase'});
assert.equal(direct.ok,false);assert.equal(direct.error,'ACCION_NO_PERMITIDA');
console.log(JSON.stringify({ok:true,endpoint:manifest.webApp.url,manifestSha256:digest,authenticatedWriteGateVerified:true,directRoutineRouteBlocked:true,missingContextBlocked:true,classroomContacted:false,validAcademicWritesSent:0,resourcesCreated:0}));

