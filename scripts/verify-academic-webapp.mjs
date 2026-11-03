import assert from 'node:assert/strict';
import {readContext} from './academic-context.mjs';

// Deployment access is Google-authenticated. CI has no end-user Google OAuth
// token, so it must verify *denial* of an unauthenticated request, not pretend
// to verify the signed HMAC path. The OAuth-authenticated MCP performs that.
const {manifest,digest}=readContext();
const response=await fetch(manifest.webApp.url,{
  method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:JSON.stringify({action:'diagnosticarFirma'}),
  signal:AbortSignal.timeout(30000)
});
if(![401,403].includes(response.status)){
  throw Error('WEBAPP_ANONYMOUS_ACCESS_NOT_DENIED_HTTP_'+response.status);
}
let hop='UNKNOWN_HTTP_GATE';
try{
  const hostname=new URL(response.url).hostname.toLowerCase();
  if(hostname==='script.google.com')hop='SCRIPT_GOOGLE_COM_ENTRY';
  else if(hostname==='accounts.google.com')hop='GOOGLE_LOGIN_REDIRECT';
  else if(hostname==='script.googleusercontent.com')hop='SCRIPT_GOOGLEUSERCONTENT_REDIRECT';
}catch{}
assert.ok(manifest.webApp.url.startsWith('https://script.google.com/'));
console.log(JSON.stringify({
  ok:true,webAppAccessPolicy:'GOOGLE_SIGNED_IN_REQUIRED',
  anonymousDenied:true,anonymousStatus:response.status,anonymousDeniedAt:hop,
  manifestSha256:digest,signedHmacTested:false,classroomContacted:false,
  validAcademicWritesSent:0,resourcesCreated:0
}));
