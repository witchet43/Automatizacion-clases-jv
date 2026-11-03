import fs from 'node:fs';
import {readContext} from './academic-context.mjs';

// Read-only diagnostic of the owner's EXISTING clasp OAuth grant.
// No token, client secret, request body, raw HTTP body or response URL is logged.
// Never export a credential, create a Secret Manager version or call Classroom.
function fail(code){throw new Error(code);}
function pickCredentials(config){
  if(config?.tokens?.default){
    const t=config.tokens.default;
    return {access:t.access_token,refresh:t.refresh_token,
      client:t.client_id,secret:t.client_secret,expiry:t.expiry_date,scope:t.scope};
  }
  if(config?.token){
    return {access:config.token.access_token,refresh:config.token.refresh_token,
      client:config.oauth2ClientSettings?.clientId,
      secret:config.oauth2ClientSettings?.clientSecret,
      expiry:config.token.expiry_date,scope:config.token.scope};
  }
  if(config?.access_token)
    return {access:config.access_token,refresh:config.refresh_token,
      client:config.client_id,secret:config.client_secret,
      expiry:config.expiry_date,scope:config.scope};
  fail('CLASP_OAUTH_CREDENTIAL_FORMAT_UNSUPPORTED');
}
function classify(url){
  try{
    const host=new URL(url).hostname;
    if(host==='script.google.com')return 'APPS_SCRIPT_WEBAPP_ENTRY';
    if(host==='script.googleusercontent.com')return 'APPS_SCRIPT_RESPONSE';
    if(host==='accounts.google.com')return 'GOOGLE_LOGIN';
    if(host==='drive.google.com')return 'GOOGLE_DRIVE_GATE';
    return 'OTHER_HOST';
  }catch{return 'UNKNOWN_HOST';}
}
async function main(){
  const raw=String(process.env.CLASPRC_JSON||'');
  if(!raw)fail('EXISTING_CLASP_CREDENTIAL_NOT_AVAILABLE');
  let config;try{config=JSON.parse(raw);}catch{fail('EXISTING_CLASP_CREDENTIAL_NOT_JSON');}
  const auth=pickCredentials(config);
  let access=auth.access;
  if(auth.refresh&&auth.client&&auth.secret){
    // Refresh the owner's existing grant in runner memory only; nothing persisted.
    const response=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:auth.client,client_secret:auth.secret,
        refresh_token:auth.refresh,grant_type:'refresh_token'}),
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)fail('EXISTING_CLASP_OAUTH_REFRESH_HTTP_'+response.status);
    let result;try{result=await response.json();}catch{fail('EXISTING_CLASP_OAUTH_REFRESH_NON_JSON');}
    access=result.access_token;
  }else if(Number(auth.expiry||0)<=Date.now()+30000){
    fail('EXISTING_CLASP_OAUTH_REFRESH_UNAVAILABLE');
  }
  if(typeof access!=='string'||access.length<20)fail('EXISTING_CLASP_OAUTH_ACCESS_TOKEN_MISSING');
  const {manifest}=readContext();
  const url=manifest.webApp.url;
  // The GET handler is deliberately disabled and returns only its code
  // after successful Google authentication. This sends NO academic data.
  const response=await fetch(url,{
    method:'GET',headers:{Authorization:'Bearer '+access,Accept:'application/json'},
    redirect:'follow',signal:AbortSignal.timeout(30000)
  });
  const finalHost=classify(response.url);
  let errorCode=null,hasExpectedHandler=false;
  if(response.ok){
    const type=String(response.headers.get('content-type')||'');
    if(type.includes('json')||type.includes('text/plain')){
      const text=await response.text();
      try{
        const value=JSON.parse(text);
        const code=String(value?.errorCode||'');
        if(/^[A-Z][A-Z0-9_]{2,79}$/.test(code))errorCode=code;
        hasExpectedHandler=code==='ACADEMIC_POST_HMAC_REQUIRED';
      }catch{}
    }
  }
  console.log(JSON.stringify({
    diagnostic:'EXISTING_OWNER_CLASP_OAUTH_TO_WEBAPP',
    accessViaBearerConfirmed:hasExpectedHandler,
    httpStatus:response.status,
    finalHostClass:finalHost,
    followedRedirect:response.redirected===true,
    expectedPostOnlyError:hasExpectedHandler,
    // This only indicates a grant scope declared in clasp; no credential contents.
    declaredDriveScope:/https:\/\/www\.googleapis\.com\/auth\/drive(\b|\.)/.test(String(auth.scope||'')),
    noClassroomCalls:true,noCredentialsExposed:true
  }));
}
try{await main();}
catch(e){
  const code=String(e?.message||'UNKNOWN');
  // Error reporting is allowlist-only; never print raw external exceptions.
  console.log(JSON.stringify({diagnostic:'EXISTING_OWNER_CLASP_OAUTH_TO_WEBAPP',
    failure:/^[A-Z][A-Z0-9_]{3,90}$/.test(code)?code:'PROBE_TRANSPORT_OR_RUNTIME_FAILED',
    noClassroomCalls:true,noCredentialsExposed:true}));
  process.exitCode=1;
}
