/**
 * CONTEXTO OPERATIVO CANÓNICO
 * Bloquea operaciones no FAST_PATH cuando el cliente no acredita que cargó
 * el manifiesto de arranque vigente. quizAsistencia queda exento por contrato.
 */
const ACADEMIC_CONTEXT_GUARD = Object.freeze({
  SCHEMA_VERSION:'1.0.0',
  MANIFEST_SHA256:'63ad2ac37faebd831ec75e50e4eb7e4d74ffc2b6d548963b631bfa34fb97c5d5',
  REPOSITORY:'witchet43/Automatizacion-clases-jv',
  BRANCH:'main',
  WEB_APP_URL:'https://script.google.com/macros/s/AKfycbz2rCuB9jUsbnt0tj0RgHmr3lguOZjVL34a_2F_yhggiwLNTOEn8QdsdbFv4SK6aGxr/exec',
  FAST_PATH_ACTIONS:Object.freeze(['quizAsistencia']),
  COURSE_IDS:Object.freeze({
    '871158466533':true,
    '871158479566':true,
    '871156721160':true,
    '871158187513':true,
    '871149624583':true,
    '871156334717':true,
    '875776451793':true
  })
});

function validarContextoOperacionalWeb_(action,p,course){
  if(ACADEMIC_CONTEXT_GUARD.FAST_PATH_ACTIONS.indexOf(String(action||''))>=0){
    return {verified:false,fastPath:true,reason:'FAST_PATH_EXEMPT'};
  }
  const ctx=p&&p.operationalContext&&typeof p.operationalContext==='object'?p.operationalContext:null;
  if(!ctx)throw new Error('OPERATIONAL_CONTEXT_REQUIRED');
  if(String(ctx.schemaVersion||'')!==ACADEMIC_CONTEXT_GUARD.SCHEMA_VERSION)
    throw new Error('OPERATIONAL_CONTEXT_SCHEMA_MISMATCH');
  if(String(ctx.manifestSha256||'')!==ACADEMIC_CONTEXT_GUARD.MANIFEST_SHA256)
    throw new Error('OPERATIONAL_CONTEXT_MANIFEST_MISMATCH');
  if(String(ctx.repository||'')!==ACADEMIC_CONTEXT_GUARD.REPOSITORY)
    throw new Error('OPERATIONAL_CONTEXT_REPOSITORY_MISMATCH');
  if(String(ctx.branch||'')!==ACADEMIC_CONTEXT_GUARD.BRANCH)
    throw new Error('OPERATIONAL_CONTEXT_BRANCH_MISMATCH');
  if(String(ctx.webAppUrl||'')!==ACADEMIC_CONTEXT_GUARD.WEB_APP_URL)
    throw new Error('OPERATIONAL_CONTEXT_ENDPOINT_MISMATCH');
  if(course){
    const id=String(course.id||'');
    if(!ACADEMIC_CONTEXT_GUARD.COURSE_IDS[id])
      throw new Error('OPERATIONAL_CONTEXT_COURSE_NOT_IN_MANIFEST');
  }
  return {verified:true,fastPath:false,schemaVersion:ACADEMIC_CONTEXT_GUARD.SCHEMA_VERSION,manifestSha256:ACADEMIC_CONTEXT_GUARD.MANIFEST_SHA256};
}
