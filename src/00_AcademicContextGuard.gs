/** Local, deterministic startup. The manifest is configuration, not authentication. */
function validarConfiguracionContextoAcademico_() {
  if(typeof ACADEMIC_CONTEXT_CONFIG==='undefined')throw new Error('ACADEMIC_CONTEXT_CONFIG_MISSING');
  const c=ACADEMIC_CONTEXT_CONFIG;
  if(c.contractVersion!=='1.1.0'||c.repository!=='witchet43/Automatizacion-clases-jv'||
     c.operatingModel!=='STATIC_WEB_APP_SERVICE'||
     c.rules.courseWorkState!=='DRAFT'||c.rules.calendarSelectsClass!==false||c.rules.currentDateSelectsClass!==false||
     c.rules.resourcesBeforeGamma!==true||c.rules.gammaReferencesVerifiedResources!==true||
     c.rules.gammaFolderRequired!==true||c.rules.gammaCreationMustPassFolderIds!==true||
     c.rules.gammaThemeRequired!==true||c.rules.gammaCreationMustPassThemeId!==true||
     c.rules.planningGammaStateIsAuthority!==false||
     c.rules.gammaLiveVerificationRequiredBeforeReuse!==true||
     c.rules.gammaLiveSearchBeforeCreate!==true||
     c.rules.gammaArchivedCountsAsPrepared!==false||
     c.rules.gammaLiveEvidenceSource!=='GAMMA_LIVE_CONNECTOR'||
     c.rules.gammaPostGenerationReadRequired!==true||
     c.rules.gammaActiveCanonicalOnlyCountsAsVerified!==true||
     c.rules.gammaPlanningStatusRole!=='REFERENCE_ONLY'||
     c.rules.notionNotesRequiredForClassPackage!==true||
     c.rules.notionNotesRoute!=='NOTION_CONNECTOR'||
     c.rules.notionLiveEvidenceSource!=='NOTION_LIVE_CONNECTOR'||
     c.rules.notionLiveVerificationRequired!==true||
     c.rules.notionSearchBeforeCreate!==true||
     c.rules.notionPostCreateFetchRequired!==true||
     c.rules.notionExactCanonicalTitleRequired!==true||
     c.rules.notionDuplicateNotesAllowed!==false||
     c.rules.notionPlanningStateIsAuthority!==false||
     c.rules.notionGammaReferenceRequiredWhenApplicable!==true||
     c.rules.classPackageCompleteRequiresNotionNotes!==true||
     c.rules.classGenerationOrder!=='GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT'||
     c.rules.courseEnvironmentProfileRequiredBeforeContentDesign!==true||
     c.rules.introTiWindowsBaselineRequired!==true||
     c.rules.introTiPracticalMultiOsAllowed!==false||
     c.rules.introTiOtherOsInstructionMode!=='CONCEPTUAL_ONLY'||
     c.rules.introTiHistoricalPublishedResourcesPolicy!=='LEAVE_AS_IS'||
     c.rules.introTiFutureMaterialsPolicy!=='WINDOWS_BASELINE_REQUIRED'||
     c.rules.staticWebAppDuringAcademicOperations!==true||
     c.rules.academicOperationsAreDataOnly!==true||
     c.rules.academicOperationMayModifySource!==false||
     c.rules.academicOperationMayModifyWorkflow!==false||
     c.rules.academicOperationMayModifyManifest!==false||
     c.rules.academicOperationMayDeploy!==false||
     c.rules.academicFailureMayTriggerDevelopment!==false||
     c.rules.recoveryRoute!=='SAME_CANONICAL_WEB_APP_ONLY'||
     c.rules.contentIsDataNotCode!==true||
     c.rules.platformChangeRequiresExplicitUserAuthorization!==true||
     c.rules.platformChangeEvidenceRequired!==true||
     c.rules.platformChangeMayMixWithAcademicRequest!==false||
     c.rules.workModeAllowed!==false||
     c.workflow.name!=='Academic Web App'||!/^[a-f0-9]{64}$/.test(c.manifestSha256))
    throw new Error('ACADEMIC_CONTEXT_CONFIG_INVALID');
  if(!c.courses||!Object.keys(c.courses).length||!c.planningSources||!Object.keys(c.planningSources).length)
    throw new Error('ACADEMIC_CONTEXT_REGISTRY_MISSING');
  if(!c.platformChange||c.platformChange.authorizationRequired!==true||
     c.platformChange.evidenceDirectory!=='.platform-changes'||
     c.platformChange.deployTrigger!=='PLATFORM_CHANGE_EVIDENCE_ONLY'||
     c.platformChange.updateExistingDeploymentOnly!==true||
     c.platformChange.newDeploymentAllowed!==false||
     c.platformChange.workModeAllowed!==false)
    throw new Error('PLATFORM_CHANGE_CONTRACT_INVALID');
  Object.keys(c.operations||{}).forEach(function(name){
    const op=c.operations[name];
    if(op.contentIsData!==true||op.sourceMutationAllowed!==false||op.deploymentAllowed!==false)
      throw new Error('ACADEMIC_OPERATION_NOT_DATA_ONLY: '+name);
  });
  if(!c.notion||c.notion.classNotesRootPageId!=='3f2cd691-30bc-8179-b64f-d36487424bfc'||
     c.notion.route!=='NOTION_CONNECTOR'||c.notion.liveEvidenceSource!=='NOTION_LIVE_CONNECTOR'||
     c.notion.requiredForClassPackage!==true||c.notion.searchBeforeCreate!==true||
     c.notion.fetchAfterCreateOrUpdate!==true||c.notion.duplicatePolicy!=='BLOCK')
    throw new Error('ACADEMIC_NOTION_CONFIG_INVALID');
  Object.keys(c.courses||{}).forEach(function(key){
    const course=c.courses[key];
    if(!course.notionNotesPageId||!course.notionNotesPageUrl)
      throw new Error('ACADEMIC_NOTION_COURSE_CONFIG_MISSING: '+key);
  });
  const iti=c.courses['introduccion-tecnologias-informacion'];
  if(!iti||iti.gammaFolderId!=='fo_w669f3b2oumuiuf'||iti.gammaThemeId!=='bfm8ztqy1whsib8')
    throw new Error('ACADEMIC_GAMMA_CONFIG_INVALID');
  const env=iti.studentEnvironmentProfile;
  if(!env||env.profileId!=='ITI_WINDOWS_BASELINE_V1'||
     env.requiredStudentEnvironment!=='ONE_WINDOWS_COMPUTER'||
     env.requiredPlatform!=='WINDOWS'||
     env.practicalWorkMustBeCompletableOnWindows!==true||
     env.evidenceMustBeCollectableOnWindows!==true||
     env.toolsMustRunOnWindows!==true||
     env.labDependencyAllowed!==false||
     env.secondOperatingSystemRequirementAllowed!==false||
     env.linuxSubsystemRequirementAllowed!==false||
     env.virtualMachineRequirementAllowed!==false||
     env.dualBootRequirementAllowed!==false||
     env.multiOperatingSystemPracticalComparisonAllowed!==false||
     env.otherOperatingSystemsInstructionMode!=='CONCEPTUAL_ONLY'||
     env.conceptualExamplesMayRequireExecution!==false||
     env.optionalExternalToolsRequireWindowsFallback!==true||
     env.windowsNativeToolsPreferred!==true||
     env.historicalPublishedResourcesPolicy!=='LEAVE_AS_IS'||
     env.futureMaterialsPolicy!=='WINDOWS_BASELINE_REQUIRED')
    throw new Error('ACADEMIC_ITI_WINDOWS_BASELINE_INVALID');
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
