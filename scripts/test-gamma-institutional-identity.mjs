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
assert.ok(unverifiedNull.issues.includes('GAMMA_THEME_APPLIED_NOT_VERIFIED'));
const noConfig={id:'11111111',materia:'Curso inventado'};
assert.throws(()=>sandbox.contratoGammaClaseCanonicaWeb_(noConfig,row),/GAMMA_IDENTITY_MANIFEST_REQUIRED/);
console.log('PASS: S19 title / cover / UAQ theme / folder derived strictly from manifest and exact planning; inconsistent Gamma cannot finalize.');
