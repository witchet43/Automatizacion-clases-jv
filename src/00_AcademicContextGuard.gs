/** Local, deterministic startup. The manifest is configuration, not authentication. */
function validarConfiguracionContextoAcademico_() {
  if(typeof ACADEMIC_CONTEXT_CONFIG==='undefined')throw new Error('ACADEMIC_CONTEXT_CONFIG_MISSING');
  const c=ACADEMIC_CONTEXT_CONFIG;
  if(c.contractVersion!=='1.1.0'||c.repository!=='witchet43/Automatizacion-clases-jv'||
     c.rules.courseWorkState!=='DRAFT'||c.rules.calendarSelectsClass!==false||c.rules.currentDateSelectsClass!==false||
     c.rules.resourcesBeforeGamma!==true||c.rules.gammaReferencesVerifiedResources!==true||
     c.rules.gammaFolderRequired!==true||c.rules.gammaCreationMustPassFolderIds!==true||
     c.rules.gammaThemeRequired!==true||c.rules.gammaCreationMustPassThemeId!==true||
     c.workflow.name!=='Academic Web App'||!/^[a-f0-9]{64}$/.test(c.manifestSha256))
    throw new Error('ACADEMIC_CONTEXT_CONFIG_INVALID');
  const manifestCourseIdentity={};
  Object.keys(c.courses||{}).forEach(function(k){manifestCourseIdentity[k]={id:c.courses[k].id,materia:c.courses[k].materia};});
  if(JSON.stringify(manifestCourseIdentity)!==JSON.stringify(ACADEMIC_WEB.COURSES)||
     JSON.stringify(c.planningSources)!==JSON.stringify(MASTER_GUARDRAILS.PLANNING_SOURCES))
    throw new Error('ACADEMIC_CONTEXT_REGISTRY_DRIFT');
  const iti=c.courses['introduccion-tecnologias-informacion'];
  if(!iti||iti.gammaFolderId!=='fo_w669f3b2oumuiuf'||iti.gammaThemeId!=='bfm8ztqy1whsib8')
    throw new Error('ACADEMIC_GAMMA_CONFIG_INVALID');
  if(c.documents.master.id!==MASTER_GUARDRAILS.MASTER_DOCUMENT_ID)
    throw new Error('ACADEMIC_CONTEXT_MASTER_DRIFT');
  return c;
}

function validarArranqueAcademicoWeb_(action,p) {
  // Preserve EXECUTE_FIRST exactly: no manifest, Docs, planning or auxiliary reads.
  if(action==='quizAsistencia')return null;
  const c=validarConfiguracionContextoAcademico_();
  const expected={source:'config/academic-context.json',contractVersion:c.contractVersion,
    manifestSha256:c.manifestSha256,repository:c.repository,workflow:c.workflow.name,endpoint:c.webApp.url};
  const supplied=p.operationalContext;
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))throw new Error('ACADEMIC_CONTEXT_REQUIRED');
  if(Object.keys(supplied).length!==Object.keys(expected).length||Object.keys(expected).some(function(k){return supplied[k]!==expected[k];}))
    throw new Error('ACADEMIC_CONTEXT_MISMATCH');
  validarSolicitudContextoAcademico_(p);
  return expected;
}

function validarSolicitudContextoAcademico_(p) {
  // Validate the whole package before its first side effect.
  if(!p||typeof p!=='object')return;
  ['state','resourceState','courseWorkState'].forEach(function(k){
    if(p[k]!==undefined&&p[k]!=='DRAFT')throw new Error('ACADEMIC_CONTEXT_DRAFT_REQUIRED');
  });
  ['endpoint','webAppUrl','transport','workflow','repository','planningSpreadsheetId','planningSource','calendarSelectsClass'].forEach(function(k){
    if(p[k]!==undefined)throw new Error('ACADEMIC_CONTEXT_OVERRIDE_FORBIDDEN: '+k);
  });
  if(p.params)validarSolicitudContextoAcademico_(p.params);
  if(p.options)validarSolicitudContextoAcademico_(p.options);
  if(Array.isArray(p.resources))p.resources.forEach(validarSolicitudContextoAcademico_);
}
