/**
 * Site MCP authorization/title contract.
 *
 * Keep the owner's explicit title separate from each classroom child title.
 * Canonicalize only MISSING outer aliases; reject conflicting values.
 * This function must run at the Site tool boundary before signing or calling
 * the canonical WebApp. It never creates academic resources.
 */
export function prepareAuthorizedAcademicDraft(input) {
  const {operation,courseId,requestId,title,authorization,params}=input||{};
  if(!params || typeof params!=='object' || Array.isArray(params))
    throw new Error('DRAFT_PARAMS_INVALID');
  if(!authorization || authorization.confirmed!==true ||
     authorization.state!=='DRAFT' || authorization.operation!==operation ||
     String(authorization.courseId)!==String(courseId) ||
     authorization.requestId!==requestId)
    throw new Error('ACADEMIC_WRITE_OWNER_AUTHORIZATION_MISMATCH');
  if(typeof title!=='string' || !title.trim() || title!==authorization.title)
    throw new Error('AUTHORIZED_TITLE_MISMATCH');
  if(operation==='quizAsistencia') {
    if(title!=='AUTO_CONSECUTIVO')throw new Error('AUTHORIZED_TITLE_MISMATCH');
    return {operation,courseId,requestId,params:{...params}};
  }
  // A class package has its own approved identity; its resources each have
  // distinct authorized classroom titles. Do not compare child titles to title.
  for(const field of ['titulo','title']) {
    if(Object.prototype.hasOwnProperty.call(params,field) && params[field]!==title)
      throw new Error('AUTHORIZED_TITLE_MISMATCH');
  }
  if(operation==='clase' && (!Array.isArray(params.resources)||!params.resources.length))
    throw new Error('CLASE_REQUIERE_RECURSOS');
  return {operation,courseId,requestId,
    params:{...params,title,titulo:title}};
}

/**
 * The Site tool handler should call this function rather than assembling
 * HMAC payloads directly. Exact owner approval is checked before signing.
 */
export function buildAuthorizedSignedAcademicDraft(input,config) {
  return buildSignedAcademicDraft(prepareAuthorizedAcademicDraft(input),config);
}

// Site server-side helper ONLY. This is not an alternate academic executor.
// All academic changes are delegated to the canonical Apps Script WebApp.
import {createHmac,randomBytes} from 'node:crypto';

const OPERATIONS=new Set(['actividad','tarea','practica','quiz','examen','material','clase','quizAsistencia']);
const REQUEST_ID=/^[A-Za-z0-9_-]{12,96}$/;

function assertDraftOnly(value) {
  if(!value || typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(assertDraftOnly);return;}
  for(const [key,child] of Object.entries(value)){
    if(['state','resourceState','courseWorkState'].includes(key) && child!=='DRAFT')
      throw new Error('ACADEMIC_DRAFT_REQUIRED');
    assertDraftOnly(child);
  }
}

export function buildSignedAcademicDraft(input,{
  manifest,manifestSha256,hmacSecret,now=Date.now(),nonce=randomBytes(24).toString('base64url')
}) {
  const {operation,courseId,params,requestId}=input?.authorization
    ? prepareAuthorizedAcademicDraft(input) : input;
  if(!hmacSecret || hmacSecret.length<32)throw new Error('WRITE_SECRET_NOT_CONFIGURED');
  if(!OPERATIONS.has(operation) ||
     !manifest.operations?.uaqExecutor?.allowedOperations?.includes(operation))
    throw new Error('WRITE_OPERATION_NOT_ALLOWED');
  if(!/^\d+$/.test(String(courseId)) || !Object.values(manifest.courses||{}).some(c=>String(c.id)===String(courseId)))
    throw new Error('UNKNOWN_CANONICAL_COURSE');
  if(!REQUEST_ID.test(String(requestId||'')))throw new Error('REQUEST_ID_REQUIRED');
  if(!params || typeof params!=='object' || Array.isArray(params))
    throw new Error('DRAFT_PARAMS_INVALID');
  assertDraftOnly(params);
  if(!/^[a-f0-9]{64}$/.test(manifestSha256))
    throw new Error('CANONICAL_MANIFEST_HASH_INVALID');
  if(!/^[-A-Za-z0-9_]{16,128}$/.test(nonce))
    throw new Error('NONCE_INVALID');

  const operationalContext={
    source:'config/academic-context.json',
    contractVersion:manifest.contractVersion,
    manifestSha256,
    repository:manifest.repository,
    workflow:manifest.workflow.name,
    endpoint:manifest.webApp.url
  };
  const unsigned={
    action:'uaqExecutor',
    operation,
    courseId:String(courseId),
    requestId,
    params:{...params,resourceState:'DRAFT',courseWorkState:'DRAFT',state:'DRAFT'},
    operationalContext
  };
  const signature=createHmac('sha256',hmacSecret)
    .update(JSON.stringify(unsigned),'utf8').digest('hex');
  return {...unsigned,auth:{timestamp:now,nonce,signature}};
}

export async function submitSignedAcademicDraft(payload,{
  webAppUrl,fetchImpl=fetch,timeoutMs=120000
}) {
  if(!webAppUrl?.startsWith('https://script.google.com/macros/s/') ||
     !webAppUrl.endsWith('/exec'))throw new Error('UNTRUSTED_CANONICAL_WEBAPP');
  if(payload?.operationalContext?.endpoint!==webAppUrl)
    throw new Error('CANONICAL_WEBAPP_MISMATCH');
  // Intentional one-time call. NEVER retry an ambiguous response.
  let response;
  try{
    response=await fetchImpl(webAppUrl,{
      method:'POST',
      headers:{'content-type':'text/plain;charset=UTF-8'},
      body:JSON.stringify(payload),
      redirect:'follow',
      signal:AbortSignal.timeout(timeoutMs)
    });
  }catch(_){throw new Error('WRITE_OUTCOME_UNKNOWN_RECONCILE_BEFORE_RETRY');}
  if(!response.ok)throw new Error('WEBAPP_WRITE_HTTP_FAILED_RECONCILE');
  let result;
  try {result=await response.json();}catch(_){throw new Error('WEBAPP_WRITE_INVALID_REPLY_RECONCILE');}
  if(!result || result.ok!==true){
    const code=typeof result?.errorCode==='string' &&
      /^[A-Z][A-Z0-9_]{2,79}$/.test(result.errorCode)
      ? result.errorCode : 'UNKNOWN';
    // Never forward potentially sensitive raw Apps Script exception messages
    // through the Site, but retain the authenticated WebApp's error code.
    throw new Error('WEBAPP_WRITE_REJECTED_'+code+'_RECONCILE');
  }
  if(result.gateway!=='UAQ_EXECUTOR' || result.alternativeRouteUsed!==false)
    throw new Error('WEBAPP_WRITE_GATEWAY_PROOF_MISSING');
  if(result.action!=='uaqExecutor' || result.operation!==payload.operation)
    throw new Error('WEBAPP_WRITE_RESULT_MISMATCH');
  return result;
}
