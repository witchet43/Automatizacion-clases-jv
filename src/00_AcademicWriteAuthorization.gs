/**
 * Authorization boundary for mutating calls to the canonical Apps Script WebApp.
 *
 * Deliberately separate from the academic implementation. This must be deployed
 * together with the Site bridge update; until then, no write tool may be enabled.
 *
 * Provision ACADEMIC_WRITE_HMAC_KEY (>=32 random characters) in this Apps Script
 * project's Script Properties, and the SAME key only in the private Site's
 * server-side secrets. Never put it in source, GitHub Actions or a URL.
 *
 * Body format:
 * {action, operation?, courseId, requestId, params?, operationalContext,
 *  auth:{timestamp:<unix milliseconds>,nonce:<random base64url>,
 *        signature:<lowercase hex HMAC-SHA256(JSON.stringify(bodyWithoutAuth))>}}
 *
 * Apps Script doPost() cannot reliably access arbitrary HTTP request headers.
 * HMAC therefore authenticates the entire JSON body, rather than a header.
 */
const ACADEMIC_WRITE_GATE = Object.freeze({
  KEY_PROPERTY: 'ACADEMIC_WRITE_HMAC_KEY',
  RECEIPT_PREFIX: 'ACADEMIC_WRITE_RECEIPT_',
  MAX_AGE_MS: 5 * 60 * 1000,
  MIN_KEY_LENGTH: 32
});

function bytesHexAcademicWrite_(bytes) {
  return bytes.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqualsAcademicWrite_(a,b) {
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff=0;
  for(var i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function validateAcademicWriteAuthorization_(request, props) {
  if(!request || typeof request!=='object' || Array.isArray(request))
    throw new Error('ACADEMIC_WRITE_REQUEST_INVALID');
  const requestId=String(request.requestId||'');
  if(!/^[a-zA-Z0-9_-]{12,96}$/.test(requestId))
    throw new Error('ACADEMIC_WRITE_REQUEST_ID_REQUIRED');
  const auth=request.auth;
  if(!auth || typeof auth!=='object' || Array.isArray(auth) ||
     Object.keys(auth).sort().join(',')!=='nonce,signature,timestamp')
    throw new Error('ACADEMIC_WRITE_AUTH_REQUIRED');
  const timestamp=auth.timestamp;
  if(!Number.isSafeInteger(timestamp) ||
     Math.abs(Date.now()-timestamp)>ACADEMIC_WRITE_GATE.MAX_AGE_MS)
    throw new Error('ACADEMIC_WRITE_AUTH_EXPIRED');
  if(typeof auth.nonce!=='string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(auth.nonce) ||
     typeof auth.signature!=='string' || !/^[a-f0-9]{64}$/.test(auth.signature))
    throw new Error('ACADEMIC_WRITE_AUTH_INVALID');
  // Match the MCP configuration loader, which trims surrounding whitespace from secrets.
  const key=String(props.getProperty(ACADEMIC_WRITE_GATE.KEY_PROPERTY)||'').trim();
  if(key.length<ACADEMIC_WRITE_GATE.MIN_KEY_LENGTH)
    throw new Error('ACADEMIC_WRITE_KEY_NOT_CONFIGURED');

  const unsigned={};
  Object.keys(request).forEach(function(k){if(k!=='auth')unsigned[k]=request[k];});
  const mac=Utilities.computeHmacSha256Signature(
    JSON.stringify(unsigned), key, Utilities.Charset.UTF_8
  );
  const calculated=bytesHexAcademicWrite_(mac);
  if(!constantTimeEqualsAcademicWrite_(calculated,auth.signature))
    throw new Error('ACADEMIC_WRITE_AUTH_INVALID');
  return requestId;
}

/**
 * One-time execution receipt, held under the Apps Script's single script lock.
 * On any failure after PENDING, retry is BLOCKED pending reconciliation.
 * This is intentional: an upstream timeout might follow a successful
 * Classroom mutation and must never trigger duplicate resource creation.
 */
function executeAuthenticatedAcademicWrite_(request,execute) {
  const props=PropertiesService.getScriptProperties();
  const requestId=validateAcademicWriteAuthorization_(request,props);
  const hash=bytesHexAcademicWrite_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,requestId,Utilities.Charset.UTF_8)
  );
  const receiptKey=ACADEMIC_WRITE_GATE.RECEIPT_PREFIX+hash;
  // Reserve the unique request receipt under a short lock, then RELEASE the
  // lock before running the canonical academic operation. In particular,
  // quizAsistencia obtains the SAME script lock for its own idempotency and
  // consecutive-number allocation. Holding our lock while calling it causes
  // a self-deadlock and leaves the request PENDING forever.
  const reserveLock=LockService.getScriptLock();
  if(!reserveLock.tryLock(30000))throw new Error('ACADEMIC_WRITE_BUSY_NO_SIDE_EFFECTS');
  try{
    if(props.getProperty(receiptKey))
      throw new Error('ACADEMIC_WRITE_DUPLICATE_BLOCKED_RECONCILE_FIRST');
    props.setProperty(receiptKey,JSON.stringify({
      status:'PENDING',action:String(request.action),
      operation:String(request.operation||''),at:Date.now()
    }));
  }finally{
    reserveLock.releaseLock();
  }

  // There is deliberately NO retry or re-entrance after reserving PENDING.
  // A failure or timeout must be reconciled via a read-only Classroom query.
  const result=execute();

  // Mark as completed using a separate lock AFTER the inner entrypoint
  // releases its script lock. Failure to record COMPLETED leaves PENDING,
  // which is safer than executing the same academic mutation twice.
  const finishLock=LockService.getScriptLock();
  if(!finishLock.tryLock(30000))
    throw new Error('ACADEMIC_WRITE_COMPLETED_RECEIPT_PENDING_RECONCILE');
  try{
    const current=props.getProperty(receiptKey);
    if(!current)throw new Error('ACADEMIC_WRITE_RECEIPT_MISSING_RECONCILE');
    props.setProperty(receiptKey,JSON.stringify({
      status:'COMPLETED',action:String(request.action),
      operation:String(request.operation||''),at:Date.now()
    }));
    return result;
  }finally{
    finishLock.releaseLock();
  }
}
