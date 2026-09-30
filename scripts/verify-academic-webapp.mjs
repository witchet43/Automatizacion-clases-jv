import assert from 'node:assert/strict';
import {prepareRequest,readContext} from './academic-context.mjs';
const {manifest}=readContext();
async function post(request){
  const response=await fetch(manifest.webApp.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
  assert.equal(response.ok,true);
  return response.json();
}
// No valid creation payload is sent by this post-deploy probe.
const missing=await post({action:'clase',materia:'Administración',resources:[]});
assert.equal(missing.ok,false);assert.equal(missing.error,'ACADEMIC_CONTEXT_REQUIRED');
const empty=prepareRequest({action:'clase',materia:'Administración',resources:[]});
const dispatch=await post(empty.request);
assert.equal(dispatch.ok,false);assert.equal(dispatch.error,'CLASE_REQUIERE_RECURSOS');
const diagnostic=prepareRequest({action:'diagnosticarClase',materia:'Administración',soloClassroom:true});
const result=await post(diagnostic.request);
assert.equal(result.ok,true);assert.equal(result.readOnly,true);
assert.equal(result.courseId,manifest.courses.administracion.id);
assert.deepEqual(result.operationalContext,diagnostic.request.operationalContext);
console.log(JSON.stringify({ok:true,readOnly:true,endpoint:manifest.webApp.url,manifestSha256:result.operationalContext.manifestSha256,claseDispatchVerified:true,missingContextBlocked:true,courseId:result.courseId,courseWorkRead:result.courseWork.length,resourcesCreated:0}));
