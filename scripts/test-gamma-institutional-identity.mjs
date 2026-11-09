import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const manifest=JSON.parse(fs.readFileSync('config/academic-context.json','utf8'));
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
const start=web.indexOf('function contratoGammaClaseCanonicaWeb_(');
const end=web.indexOf('function planificarClaseCanonicaWeb_(',start);
assert.ok(start>=0&&end>start,'Class Gamma identity contract must be executable');
const sandbox={String,Object,Array,Error,ACADEMIC_CONTEXT_CONFIG:manifest};
vm.createContext(sandbox);
vm.runInContext(web.slice(start,end),sandbox);
const row={session:'19',unit:'Unidad 2',topic:'2.4 Programación de socket con UDP + 2.5 Construcción de un servidor Web'};
const course={id:'871158466533',materia:'Sistemas Distribuidos'};
const contract=sandbox.contratoGammaClaseCanonicaWeb_(course,row);
assert.equal(contract.source,'MANIFEST_COURSE_AND_CANONICAL_PLANNING');
assert.equal(contract.title,'2.4 - Programación de socket con UDP + 2.5 - Construcción de un servidor Web');
assert.equal(contract.coverTitle,'Unidad 2 · Tema 2.4 - Programación de socket con UDP + 2.5 - Construcción de un servidor Web');
assert.equal(contract.themeId,'bfm8ztqy1whsib8');
assert.equal(contract.themeName,'UAQ');
assert.equal(contract.folderId,'fo_2538kazbe3ajvec');
assert.ok(!contract.title.includes('Sesión 19'));
const valid={
 status:'LIVE_ACTIVE_CANONICAL',
 title:contract.title,themeIdSent:contract.themeId,
 themeRequestVerified:true,themeIdReturned:null,themeAppliedVerified:true,
 folderIdSent:contract.folderId,folderRequestVerified:true
};
const check=raw=>sandbox.verificarIdentidadGammaClaseWeb_(raw,contract);
assert.equal(check(valid).valid,true);
assert.equal(check(null).action,'VERIFY_LIVE');
assert.deepEqual([...check(null).issues],[]);
const incorrectTitle=check({...valid,title:'Sesión 19: Programación de sockets con UDP'});
assert.equal(incorrectTitle.valid,false);
assert.ok(incorrectTitle.issues.includes('GAMMA_TITLE_MISMATCH'));
const defaultTheme=check({...valid,themeIdSent:'',themeRequestVerified:false,themeAppliedVerified:false});
assert.ok(defaultTheme.issues.includes('GAMMA_THEME_NOT_SENT_FROM_MANIFEST'));
assert.ok(defaultTheme.issues.includes('GAMMA_THEME_APPLIED_NOT_VERIFIED'));
assert.equal(defaultTheme.action,'REPAIR_EXISTING_GAMMA_IDENTITY');
const wrongReturnedTheme=check({...valid,themeIdReturned:'g_file'});
assert.ok(wrongReturnedTheme.issues.includes('GAMMA_THEME_RETURNED_MISMATCH'));
const wrongFolder=check({...valid,folderIdSent:'fo_other'});
assert.ok(wrongFolder.issues.includes('GAMMA_FOLDER_NOT_SENT_FROM_MANIFEST'));
const unverifiedNull=check({...valid,themeAppliedVerified:false});
assert.equal(unverifiedNull.valid,true,'Gamma null is a known provider response when the exact UAQ theme request is verified');
assert.equal(unverifiedNull.themeVerification,'REQUEST_VERIFIED_PROVIDER_RETURNED_NULL');
assert.equal(unverifiedNull.themeAppliedVerified,false,'Never claim the visual theme was provider-confirmed');
const missingResponse={...valid,themeAppliedVerified:false};delete missingResponse.themeIdReturned;
assert.ok(check(missingResponse).issues.includes('GAMMA_THEME_APPLIED_NOT_VERIFIED'),
 'Missing theme response is not the same as explicit provider null');
const so=sandbox.contratoGammaClaseCanonicaWeb_({id:'875776451793',materia:'Sistemas Operativos'},
  {session:'20',unit:'2',topic:'Interbloqueos: condiciones necesarias',curricularNumber:'2.12'});
assert.equal(so.title,'2.12 - Interbloqueos: condiciones necesarias');
assert.equal(so.coverTitle,'2.12 - Interbloqueos: condiciones necesarias');
assert.equal(so.themeName,'UAQ');
assert.equal(so.folderId,'fo_oig9jvuoy9kbmdw');
const linked=sandbox.referenciaActividadPlaneadaClaseWeb_(
  {session:'20',activityDocumentUrl:'https://docs.google.com/document/d/1nTPW0HMCCBmY9BBiRVOwOBpVoWTxbcXztzIIuqjinTM/edit'},
  {'20':{source:'GOOGLE_DRIVE_LIVE_CONNECTOR',status:'LIVE_DOCUMENT',
    documentId:'1nTPW0HMCCBmY9BBiRVOwOBpVoWTxbcXztzIIuqjinTM',
    title:'Actividad 10 - Grafo de asignación de recursos y deadlock',
    contentVerified:true,canonicalTopicVerified:true}});
assert.equal(linked.liveVerified,true);
assert.equal(linked.courseWorkCreated,false);
assert.equal(linked.decision,'REUSE_EXISTING_DOCUMENT');
assert.equal(sandbox.referenciaActividadPlaneadaClaseWeb_(
  {session:'20',activityDocumentUrl:linked.url},
  {'20':{source:'GOOGLE_DRIVE_LIVE_CONNECTOR',status:'LIVE_DOCUMENT',documentId:'incorrect',
    contentVerified:true,canonicalTopicVerified:true}}).liveVerified,false);
const noConfig={id:'11111111',materia:'Curso inventado'};
assert.throws(()=>sandbox.contratoGammaClaseCanonicaWeb_(noConfig,row),/GAMMA_IDENTITY_MANIFEST_REQUIRED/);
console.log('PASS: S19 title / cover / UAQ theme / folder derived strictly from manifest and exact planning; inconsistent Gamma cannot finalize.');
