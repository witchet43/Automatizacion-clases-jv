import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/68_FormsApiRuntimeDiagnostic.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
assert.match(web,/formsApiProbe:soloClassroom\?diagnosticarGoogleFormsApiSoloLectura_/);
assert.match(web,/diagnosticarGoogleFormsApiSoloLectura_\(\)/);
const diagnosticStart=web.indexOf('function diagnosticarProgresoClaseWeb_(course,p)');
assert.ok(diagnosticStart>0);
assert.doesNotMatch(web.slice(0,diagnosticStart),/const ultimoFallo=leerUltimoFalloAcademicoWeb_/);
assert.match(web.slice(diagnosticStart),/const ultimoFallo=leerUltimoFalloAcademicoWeb_/);
let auth='NOT_REQUIRED',tokenFail=false,fetchFail=false,http=404,fetchCount=0;
const scopeBody='https://www.googleapis.com/auth/forms.body';
const scopeFetch='https://www.googleapis.com/auth/script.external_request';
const ctx={
  ScriptApp:{
    AuthMode:{FULL:'FULL'},AuthorizationStatus:{REQUIRED:'REQUIRED'},
    getAuthorizationInfo:(_mode,scopes)=>({
      getAuthorizedScopes:()=>auth==='REQUIRED'?[scopeBody]:scopes,
      getAuthorizationStatus:()=>auth
    }),
    getOAuthToken:()=>{if(tokenFail)throw Error('permission denied');return 'TOKEN_NOT_EXPOSED';}
  },
  UrlFetchApp:{fetch:(url,opts)=>{
    fetchCount++;
    assert.equal(opts.method,'get');assert.equal(opts.muteHttpExceptions,true);
    assert.match(url,/ACADEMIC_READONLY_INVALID_FORM_ID$/);
    if(fetchFail)throw Error('Socket connection failed');
    return {getResponseCode:()=>http,getContentText:()=>JSON.stringify({error:{status:'NOT_FOUND',message:'private google response'}})};
  }}
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
let result=ctx.diagnosticarGoogleFormsApiSoloLectura_();
assert.equal(result.readOnly,true);assert.equal(result.status,'HTTP_RESPONSE');
assert.equal(result.httpStatus,404);assert.equal(result.formsBodyGranted,true);
assert.equal(result.externalRequestGranted,true);
assert.equal(result.googleStatus,'NOT_FOUND');
assert.ok(!JSON.stringify(result).includes('TOKEN_NOT_EXPOSED'));
assert.ok(!JSON.stringify(result).includes('private google response'));
assert.equal(fetchCount,1);
auth='REQUIRED';
result=ctx.diagnosticarGoogleFormsApiSoloLectura_();
assert.equal(result.status,'AUTHORIZATION_REQUIRED');
assert.equal(result.externalRequestGranted,false);
assert.equal(fetchCount,1);
auth='NOT_REQUIRED';tokenFail=true;
result=ctx.diagnosticarGoogleFormsApiSoloLectura_();
assert.equal(result.status,'OAUTH_TOKEN_FAILED');
assert.equal(result.category,'PERMISSION_OR_CONSENT');
assert.equal(fetchCount,1);
tokenFail=false;fetchFail=true;
result=ctx.diagnosticarGoogleFormsApiSoloLectura_();
assert.equal(result.status,'URL_FETCH_FAILED');
assert.equal(result.stage,'URL_FETCH');
assert.equal(result.category,'NETWORK');
assert.equal(fetchCount,2);
assert.equal(ctx.clasificarFalloFormsApiSeguro_(Error('Service invoked too many times')),'QUOTA');
console.log('PASS: signed Forms incident probe is read-only, staged and sanitized.');
