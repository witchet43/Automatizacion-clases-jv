import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
const script=JSON.parse(fs.readFileSync('.clasp.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('src/appsscript.json','utf8'));
const credentials=JSON.parse(process.env.CLASPRC_JSON||'{}');
const stored=credentials.tokens?.default||credentials.token||credentials;
const refresh=stored.refresh_token,client=stored.client_id||credentials.oauth2ClientSettings?.clientId;
const secret=stored.client_secret||credentials.oauth2ClientSettings?.clientSecret;
const report={check:'EXISTING_SCRIPT_EXECUTION_API_AUTH',noClassroomCalls:true,
 noCredentialsExposed:true,mutationAttempted:false};
function fail(code){throw Error(code);}
async function jsonSafe(response){
  try{return await response.json();}catch{return {};}
}
async function getToken(){
  if(!refresh||!client||!secret)fail('OWNER_OAUTH_REFRESH_NOT_AVAILABLE');
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({refresh_token:refresh,client_id:client,
      client_secret:secret,grant_type:'refresh_token'}),signal:AbortSignal.timeout(18000)
  });
  if(!response.ok)fail('OWNER_OAUTH_REFRESH_HTTP_'+response.status);
  const data=await jsonSafe(response);
  if(typeof data.access_token!=='string')fail('OWNER_OAUTH_REFRESH_TOKEN_MISSING');
  return data.access_token;
}
function classifyProblem(info,status){
  const message=String(info?.error?.message||'').toLowerCase();
  const apiStatus=String(info?.error?.status||'UNKNOWN').replace(/[^A-Z_]/g,'').slice(0,40);
  if(message.includes('same cloud platform project')||message.includes('does not have permission'))
    return 'PROJECT_IDENTITY_OR_PERMISSION';
  if(message.includes('scope')||message.includes('authorization'))
    return 'MISSING_OAUTH_SCOPE';
  if(message.includes('has not been used')||message.includes('is disabled'))
    return 'APPS_SCRIPT_API_DISABLED';
  if(message.includes('function')&&message.includes('not found'))
    return 'FUNCTION_MISSING_EXPECTED';
  if(status===401)return 'UNAUTHENTICATED';
  if(status===403)return 'PERMISSION_DENIED_UNCLASSIFIED';
  return apiStatus||'OTHER';
}
try{
 const token=await getToken();
 const tokeninfo=await fetch('https://oauth2.googleapis.com/tokeninfo',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({access_token:token}),signal:AbortSignal.timeout(15000)
 });
 const ti=await jsonSafe(tokeninfo);
 const granted=new Set(String(ti.scope||'').split(/\s+/).filter(Boolean));
 report.tokenInfoHttpStatus=tokeninfo.status;
 report.requiredScopeCount=manifest.oauthScopes.length;
 report.missingRequiredScopes=manifest.oauthScopes.filter(x=>!granted.has(x));
 report.hasAllScriptScopes=report.missingRequiredScopes.length===0;
 const list=await fetch('https://script.googleapis.com/v1/projects/'+
   encodeURIComponent(script.scriptId)+'/deployments?pageSize=100',{
   headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)
 });
 report.inventoryHttpStatus=list.status;
 if(!list.ok)fail('DEPLOYMENT_INVENTORY_UNAVAILABLE');
 const docs=await jsonSafe(list);
 const api=(docs.deployments||[]).filter(x=>(x.entryPoints||[]).some(y=>y.entryPointType==='EXECUTION_API'));
 const pick=api.sort((a,b)=>Number(b.deploymentConfig?.versionNumber||0)-Number(a.deploymentConfig?.versionNumber||0))[0];
 report.existingApiExecutableCount=api.length;
 report.selectedVersionNumber=Number(pick?.deploymentConfig?.versionNumber||0);
 if(!pick?.deploymentId)fail('NO_EXISTING_EXECUTION_API');
 // Intentionally call a function guaranteed not to exist, so no Classroom operation can run.
 const harmlessName='__never_execute_diagnostic_'+randomBytes(12).toString('hex');
 const test=await fetch('https://script.googleapis.com/v1/scripts/'+
    encodeURIComponent(pick.deploymentId)+':run',{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({function:harmlessName,parameters:[]}),
    signal:AbortSignal.timeout(25000)
 });
 const info=await jsonSafe(test);
 report.executionApiHttpStatus=test.status;
 report.executionApiStatus=String(info?.error?.status||'').replace(/[^A-Z_]/g,'').slice(0,45)||null;
 report.executionAuthAssessment=classifyProblem(info,test.status);
 report.expectedUnknownFunction=Boolean(info?.error||info?.response?.error);
 report.succeededUnexpectedly=Boolean(info?.response&&!info?.response?.error);
 if(report.succeededUnexpectedly)process.exitCode=1;
}catch(error){
 const code=String(error?.message||'UNKNOWN');
 report.failure=/^[A-Z][A-Z0-9_]{3,95}$/.test(code)?code:'SAFE_PROBE_FAILED';
 process.exitCode=1;
}finally{console.log(JSON.stringify(report));}
