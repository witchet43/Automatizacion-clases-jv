/**
 * Read-only Google Forms REST runtime probe.
 * Only invoked after a recorded Forms failure. No Classroom/Form changes.
 * Never return tokens, URLs, IDs or untrusted provider message bodies.
 */
function diagnosticarGoogleFormsApiSoloLectura_() {
  const bodyScope='https://www.googleapis.com/auth/forms.body';
  const fetchScope='https://www.googleapis.com/auth/script.external_request';
  const out={readOnly:true,stage:'SCOPES',status:'UNKNOWN'};
  try {
    const auth=ScriptApp.getAuthorizationInfo(
      ScriptApp.AuthMode.FULL,[bodyScope,fetchScope]);
    const granted=auth.getAuthorizedScopes();
    const scopes=Array.isArray(granted)?granted:[];
    out.formsBodyGranted=granted==null?null:scopes.indexOf(bodyScope)>=0;
    out.externalRequestGranted=granted==null?null:scopes.indexOf(fetchScope)>=0;
    out.authorizationStatus=String(auth.getAuthorizationStatus()||'');
    if(out.authorizationStatus===String(ScriptApp.AuthorizationStatus.REQUIRED)){
      out.status='AUTHORIZATION_REQUIRED';
      return out;
    }
  }catch(err){
    out.status='SCOPE_CHECK_FAILED';
    out.category=clasificarFalloFormsApiSeguro_(err);
    return out;
  }
  out.stage='TOKEN';
  let token;
  try {
    token=ScriptApp.getOAuthToken();
    if(!token){out.status='EMPTY_OAUTH_TOKEN';return out;}
  }catch(err){
    out.status='OAUTH_TOKEN_FAILED';
    out.category=clasificarFalloFormsApiSeguro_(err);
    return out;
  }
  out.stage='URL_FETCH';
  try {
    // Invalid ID: 400/404 is expected and proves transport without reading a Form.
    const response=UrlFetchApp.fetch(
      'https://forms.googleapis.com/v1/forms/ACADEMIC_READONLY_INVALID_FORM_ID',
      {method:'get',headers:{Authorization:'Bearer '+token},
       muteHttpExceptions:true});
    out.status='HTTP_RESPONSE';
    out.httpStatus=Number(response.getResponseCode());
    try{
      const error=JSON.parse(response.getContentText()||'{}').error||{};
      const safe=String(error.status||'');
      out.googleStatus=/^[A-Z_]{3,40}$/.test(safe)?safe:'UNKNOWN';
    }catch(ignore){out.googleStatus='UNKNOWN';}
  }catch(err){
    out.status='URL_FETCH_FAILED';
    out.category=clasificarFalloFormsApiSeguro_(err);
    const kind=String(err&&err.name||'');
    out.exceptionClass=['Exception','Error','TypeError','ReferenceError'].indexOf(kind)>=0
      ?kind:'OTHER';
  }
  return out;
}

function clasificarFalloFormsApiSeguro_(err) {
  const msg=String(err&&err.message||err||'');
  if(/permission|permiso|autoriz|authorization|scope|access denied|acceso denegado/i.test(msg))
    return 'PERMISSION_OR_CONSENT';
  if(/quota|too many times|rate limit|demasiadas veces|cuota|excedido el l[ií]mite/i.test(msg))
    return 'QUOTA';
  if(/timeout|timed? ?out|deadline|tiempo de espera/i.test(msg))
    return 'TIMEOUT';
  if(/invalid argument|argumento inv[aá]lido|invalid url|url inv[aá]lida|malformed/i.test(msg))
    return 'INVALID_REQUEST';
  if(/dns|socket|ssl|tls|host|certificate|certificado|connection|conexi[oó]n|address unavailable/i.test(msg))
    return 'NETWORK';
  return 'UNCLASSIFIED';
}
