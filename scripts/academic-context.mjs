import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

export const manifestPath = 'config/academic-context.json';
export const bundlePath = 'src/00_AcademicContextConfig.gs';
export function readContext() {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (manifest.repository !== 'witchet43/Automatizacion-clases-jv' ||
      manifest.webApp.url !== 'https://script.google.com/macros/s/AKfycbz2rCuB9jUsbnt0tj0RgHmr3lguOZjVL34a_2F_yhggiwLNTOEn8QdsdbFv4SK6aGxr/exec' ||
      manifest.workflow.name !== 'Academic Web App' || manifest.contractVersion !== '1.1.0' ||
      manifest.rules.courseWorkState !== 'DRAFT' || manifest.rules.calendarSelectsClass !== false || manifest.rules.currentDateSelectsClass !== false ||
      manifest.rules.resourcesBeforeGamma !== true || manifest.rules.gammaReferencesVerifiedResources !== true ||
      manifest.rules.routeResolution !== 'MANIFEST_OPERATION_ONLY' ||
      manifest.rules.workModeRole !== 'FORBIDDEN_FOR_CANONICAL_ACADEMIC_OPERATIONS' ||
      manifest.rules.gammaFolderRequired !== true || manifest.rules.gammaCreationMustPassFolderIds !== true ||
      manifest.rules.gammaThemeRequired !== true || manifest.rules.gammaCreationMustPassThemeId !== true ||
      JSON.stringify(manifest.fastPaths) !== '["quizAsistencia"]') throw Error('ACADEMIC_CONTEXT_INVALID');
  for (const key of ['bootstrap','master','classGuide','runbook']) {
    const doc = manifest.documents[key];
    if (!doc?.id || doc.url !== `https://docs.google.com/document/d/${doc.id}/edit`) throw Error('ACADEMIC_DOCUMENT_INVALID: '+key);
  }
  // Detect drift against the actual existing registries, without network access.
  const ctx = vm.createContext({});
  for (const path of ['src/65_QuizAsistenciaWebApp.gs','src/39_MasterGuardrails.gs']) vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
  const courses = JSON.parse(vm.runInContext('JSON.stringify(ACADEMIC_WEB.COURSES)',ctx));
  const planning = JSON.parse(vm.runInContext('JSON.stringify(MASTER_GUARDRAILS.PLANNING_SOURCES)',ctx));
  const manifestCourseIdentity = Object.fromEntries(Object.entries(manifest.courses).map(([k,v])=>[k,{id:v.id,materia:v.materia}]));
  if (JSON.stringify(courses)!==JSON.stringify(manifestCourseIdentity) || JSON.stringify(planning)!==JSON.stringify(manifest.planningSources)) throw Error('ACADEMIC_REGISTRY_DRIFT');
  for (const [key,course] of Object.entries(manifest.courses)) {
    if (course.materia?.startsWith('Introducción a las Tecnologías de Información') || key==='introduccion-tecnologias-informacion') {
      if (course.gammaFolderId!=='fo_w669f3b2oumuiuf' || course.gammaThemeId!=='bfm8ztqy1whsib8') throw Error('ACADEMIC_GAMMA_CONFIG_INVALID: '+key);
    }
  }
  return { manifest, digest };
}
export function envelope(manifest,digest) {
  return {source:manifestPath,contractVersion:manifest.contractVersion,manifestSha256:digest,repository:manifest.repository,workflow:manifest.workflow.name,endpoint:manifest.webApp.url};
}
export function prepareRequest(request) {
  const {manifest,digest}=readContext();
  if (!request || typeof request!=='object' || Array.isArray(request)) throw Error('REQUEST_INVALID');
  if (manifest.fastPaths.includes(request.action)) {
    if (Object.keys(request).some(k=>!['action','materia'].includes(k))) throw Error('FAST_PATH_INPUT_INVALID');
    return {endpoint:manifest.webApp.url,request};
  }
  const expected=envelope(manifest,digest);
  if (request.operationalContext && JSON.stringify(request.operationalContext)!==JSON.stringify(expected)) throw Error('ACADEMIC_REQUEST_CONTEXT_MISMATCH');
  return {endpoint:manifest.webApp.url,request:{...request,operationalContext:expected}};
}
export function bundle() {
  const {manifest,digest}=readContext();
  return '// Generated from config/academic-context.json. Do not edit.\nconst ACADEMIC_CONTEXT_CONFIG = '+JSON.stringify({manifestSha256:digest,...manifest},null,2)+';\n';
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [mode,input,output]=process.argv.slice(2);
  if (mode==='build') fs.writeFileSync(bundlePath,bundle());
  else if (mode==='check') {
    if(fs.readFileSync(bundlePath,'utf8')!==bundle()) throw Error('ACADEMIC_CONTEXT_BUNDLE_STALE');
    console.log('Canonical context and generated Apps Script bundle verified');
  } else if(mode==='prepare') {
    const result=prepareRequest(JSON.parse(fs.readFileSync(input,'utf8')));
    fs.writeFileSync(output,JSON.stringify(result.request));
    console.log(result.endpoint);
  } else throw Error('Use build, check or prepare <request> <output>');
}
