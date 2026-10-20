// MCP Site private server-side bridge: signed Classroom grading requests.
// This module does not itself expose MCP tools or create another executor.
import {createHmac,randomBytes} from 'node:crypto';

const ACTIONS=new Set(['listarEntregasEvaluables','leerEvidenciaEntrega','guardarEvaluacionDraft']);
const REQUEST_ID=/^[a-zA-Z0-9_-]{12,96}$/;
const NUMERIC_ID=/^\d+$/;

export function buildSignedGradingRequest({action,courseId,courseWorkId,submissionId,driveFileId,evaluation,requestId},{
  manifest,manifestSha256,hmacSecret,now=Date.now(),nonce=randomBytes(24).toString('base64url')
}){
  if(!ACTIONS.has(action))throw new Error('GRADING_ACTION_INVALID');
  if(!hmacSecret||hmacSecret.length<32)throw new Error('WRITE_SECRET_NOT_CONFIGURED');
  if(!NUMERIC_ID.test(String(courseId))||!Object.values(manifest.courses||{}).some(c=>String(c.id)===String(courseId)))
    throw new Error('UNKNOWN_CANONICAL_COURSE');
  if(!NUMERIC_ID.test(String(courseWorkId)))throw new Error('COURSEWORK_ID_INVALID');
  if(!REQUEST_ID.test(String(requestId)))throw new Error('REQUEST_ID_REQUIRED');
  if(!/^[a-f0-9]{64}$/.test(manifestSha256))throw new Error('MANIFEST_HASH_INVALID');
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(nonce))throw new Error('NONCE_INVALID');
  const params={courseWorkId:String(courseWorkId)};
  if(action==='leerEvidenciaEntrega'){
    if(!submissionId||!driveFileId)throw new Error('EVIDENCE_TARGET_REQUIRED');
    params.submissionId=String(submissionId);
    params.driveFileId=String(driveFileId);
  }
  if(action==='guardarEvaluacionDraft'){
    if(!submissionId||!evaluation||evaluation.confirmed!==true||
       evaluation.evidenceReviewed!==true)throw new Error('GRADE_APPROVAL_REQUIRED');
    // Strict allowlist: never permit assignedGrade, return, publication, or side effects.
    const allowed=['score','maxPoints','justification','criteria','reviewedFileIds','confirmed','evidenceReviewed'];
    for(const k of Object.keys(evaluation))if(!allowed.includes(k))throw new Error('GRADING_FIELD_NOT_ALLOWED');
    params.submissionId=String(submissionId);
    for(const k of allowed)if(k in evaluation)params[k]=evaluation[k];
  }
  const operationalContext={
    source:'config/academic-context.json',
    contractVersion:manifest.contractVersion,
    manifestSha256,repository:manifest.repository,
    workflow:manifest.workflow.name,endpoint:manifest.webApp.url
  };
  const unsigned={action,courseId:String(courseId),requestId,params,operationalContext};
  const signature=createHmac('sha256',hmacSecret).update(JSON.stringify(unsigned),'utf8').digest('hex');
  return {...unsigned,auth:{timestamp:now,nonce,signature}};
}

export async function submitSignedGradingRequest(payload,{webAppUrl,fetchImpl=fetch,timeoutMs=120000}){
  if(!webAppUrl?.startsWith('https://script.google.com/macros/s/')||!webAppUrl.endsWith('/exec'))
    throw new Error('UNTRUSTED_CANONICAL_WEBAPP');
  if(payload.operationalContext?.endpoint!==webAppUrl)throw new Error('CANONICAL_WEBAPP_MISMATCH');
  let response;
  try {
    response=await fetchImpl(webAppUrl,{
      method:'POST',headers:{'content-type':'text/plain;charset=UTF-8'},
      body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(_){throw new Error('GRADING_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY');}
  if(!response.ok)throw new Error('GRADING_HTTP_FAILED');
  let result;
  try{result=await response.json();}catch(_){throw new Error('GRADING_INVALID_JSON');}
  if(!result||result.ok!==true||result.action!==payload.action)
    throw new Error('GRADING_RESPONSE_INVALID');
  if(payload.action==='guardarEvaluacionDraft'){
    if(result.result?.returnedByAutomation!==false||
       result.result?.assignedGrade!==null||
       !Number.isFinite(Number(result.result?.draftGrade)))
      throw new Error('GRADING_POSTFLIGHT_INVALID');
  }
  return result;
}
