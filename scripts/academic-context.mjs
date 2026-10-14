import fs from 'node:fs';
import crypto from 'node:crypto';
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
      manifest.operatingModel !== 'STATIC_WEB_APP_SERVICE' ||
      manifest.rules.staticWebAppDuringAcademicOperations !== true ||
      manifest.rules.academicOperationsAreDataOnly !== true ||
      manifest.rules.academicRequestRepositoryMutationScope !== 'ACADEMIC_REQUEST_FILE_ONLY' ||
      manifest.rules.academicOperationMayModifySource !== false ||
      manifest.rules.academicOperationMayModifyWorkflow !== false ||
      manifest.rules.academicOperationMayModifyManifest !== false ||
      manifest.rules.academicOperationMayDeploy !== false ||
      manifest.rules.academicFailureMayTriggerDevelopment !== false ||
      manifest.rules.recoveryRoute !== 'SAME_CANONICAL_WEB_APP_ONLY' ||
      manifest.rules.contentIsDataNotCode !== true ||
      manifest.rules.platformChangeRequiresExplicitUserAuthorization !== true ||
      manifest.rules.platformChangeEvidenceRequired !== true ||
      manifest.rules.platformChangeMayMixWithAcademicRequest !== false ||
      manifest.rules.workModeAllowed !== false ||
      manifest.rules.routineMutationGateway !== 'UAQ_EXECUTOR' ||
      manifest.rules.routineMutationExternalAction !== 'uaqExecutor' ||
      manifest.rules.directRoutineMutationRequestAllowed !== false ||
      manifest.rules.routineOperationSourceInspectionAllowed !== false ||
      manifest.rules.routineOperationWorkflowInspectionAllowed !== false ||
      manifest.rules.routineOperationMaxAcademicRequests !== 1 ||
      manifest.rules.routineOperationPostflightMode !== 'BUILT_IN_RESULT' ||
      manifest.rules.routineOperationAlternativeRouteAllowed !== false ||
      manifest.rules.routineOperationGatewayFailureBehavior !== 'BLOCK_NO_ALTERNATE_ROUTE' ||
      manifest.rules.workModeRole !== 'FORBIDDEN_FOR_CANONICAL_ACADEMIC_OPERATIONS' ||
      manifest.rules.gammaFolderRequired !== true || manifest.rules.gammaCreationMustPassFolderIds !== true ||
      manifest.rules.gammaThemeRequired !== true || manifest.rules.gammaCreationMustPassThemeId !== true ||
      manifest.rules.planningGammaStateIsAuthority !== false ||
      manifest.rules.gammaLiveVerificationRequiredBeforeReuse !== true ||
      manifest.rules.gammaLiveSearchBeforeCreate !== true ||
      manifest.rules.gammaArchivedCountsAsPrepared !== false ||
      manifest.rules.gammaLiveEvidenceSource !== 'GAMMA_LIVE_CONNECTOR' ||
      manifest.rules.gammaPostGenerationReadRequired !== true ||
      manifest.rules.gammaActiveCanonicalOnlyCountsAsVerified !== true ||
      manifest.rules.gammaPlanningStatusRole !== 'REFERENCE_ONLY' ||
      manifest.rules.notionNotesRequiredForClassPackage !== true ||
      manifest.rules.notionNotesRoute !== 'NOTION_CONNECTOR' ||
      manifest.rules.notionLiveEvidenceSource !== 'NOTION_LIVE_CONNECTOR' ||
      manifest.rules.notionLiveVerificationRequired !== true ||
      manifest.rules.notionSearchBeforeCreate !== true ||
      manifest.rules.notionPostCreateFetchRequired !== true ||
      manifest.rules.notionExactCanonicalTitleRequired !== true ||
      manifest.rules.notionDuplicateNotesAllowed !== false ||
      manifest.rules.notionPlanningStateIsAuthority !== false ||
      manifest.rules.notionGammaReferenceRequiredWhenApplicable !== true ||
      manifest.rules.classPackageCompleteRequiresNotionNotes !== true ||
      manifest.rules.classGenerationOrder !== 'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT' ||
      manifest.rules.courseEnvironmentProfileRequiredBeforeContentDesign !== true ||
      manifest.rules.introTiWindowsBaselineRequired !== true ||
      manifest.rules.introTiPracticalMultiOsAllowed !== false ||
      manifest.rules.introTiOtherOsInstructionMode !== 'CONCEPTUAL_ONLY' ||
      manifest.rules.introTiHistoricalPublishedResourcesPolicy !== 'LEAVE_AS_IS' ||
      manifest.rules.introTiFutureMaterialsPolicy !== 'WINDOWS_BASELINE_REQUIRED' ||
      JSON.stringify(manifest.fastPaths) !== '["quizAsistencia"]') throw Error('ACADEMIC_CONTEXT_INVALID');
  if (!manifest.platformChange || manifest.platformChange.authorizationRequired !== true ||
      manifest.platformChange.authorizationSource !== 'EXPLICIT_CURRENT_USER_REQUEST' ||
      manifest.platformChange.evidenceDirectory !== '.platform-changes' ||
      manifest.platformChange.evidenceFileMustQuoteUserAuthorization !== true ||
      manifest.platformChange.academicRequestMayNotShareCommit !== true ||
      manifest.platformChange.deployTrigger !== 'PLATFORM_CHANGE_EVIDENCE_ONLY' ||
      manifest.platformChange.updateExistingDeploymentOnly !== true ||
      manifest.platformChange.newDeploymentAllowed !== false ||
      manifest.platformChange.workModeAllowed !== false) throw Error('PLATFORM_CHANGE_CONTRACT_INVALID');
  for (const [name,op] of Object.entries(manifest.operations || {})) {
    if (op.contentIsData !== true || op.sourceMutationAllowed !== false || op.deploymentAllowed !== false)
      throw Error('ACADEMIC_OPERATION_NOT_DATA_ONLY: '+name);
  }
  for (const key of ['bootstrap','master','classGuide','runbook']) {
    const doc = manifest.documents[key];
    if (!doc?.id || doc.url !== `https://docs.google.com/document/d/${doc.id}/edit`) throw Error('ACADEMIC_DOCUMENT_INVALID: '+key);
  }
  if (!manifest.notion || manifest.notion.classNotesRootPageId!=='3f2cd691-30bc-8179-b64f-d36487424bfc' ||
      manifest.notion.route!=='NOTION_CONNECTOR' || manifest.notion.liveEvidenceSource!=='NOTION_LIVE_CONNECTOR' ||
      manifest.notion.requiredForClassPackage!==true || manifest.notion.searchBeforeCreate!==true ||
      manifest.notion.fetchAfterCreateOrUpdate!==true || manifest.notion.duplicatePolicy!=='BLOCK')
    throw Error('ACADEMIC_NOTION_CONFIG_INVALID');
  // Runtime course/planning registries are consumed directly from the generated
  // manifest bundle. There is no handwritten second registry to drift.
  for (const [key,course] of Object.entries(manifest.courses)) {
    if (!course.notionNotesPageId || !course.notionNotesPageUrl)
      throw Error('ACADEMIC_NOTION_COURSE_CONFIG_MISSING: '+key);
    if (course.materia?.startsWith('Introducción a las Tecnologías de Información') || key==='introduccion-tecnologias-informacion') {
      if (course.gammaFolderId!=='fo_w669f3b2oumuiuf' || course.gammaThemeId!=='bfm8ztqy1whsib8') throw Error('ACADEMIC_GAMMA_CONFIG_INVALID: '+key);
      const env=course.studentEnvironmentProfile;
      if (!env || env.profileId!=='ITI_WINDOWS_BASELINE_V1' ||
          env.requiredStudentEnvironment!=='ONE_WINDOWS_COMPUTER' ||
          env.requiredPlatform!=='WINDOWS' ||
          env.practicalWorkMustBeCompletableOnWindows!==true ||
          env.evidenceMustBeCollectableOnWindows!==true ||
          env.toolsMustRunOnWindows!==true ||
          env.labDependencyAllowed!==false ||
          env.secondOperatingSystemRequirementAllowed!==false ||
          env.linuxSubsystemRequirementAllowed!==false ||
          env.virtualMachineRequirementAllowed!==false ||
          env.dualBootRequirementAllowed!==false ||
          env.multiOperatingSystemPracticalComparisonAllowed!==false ||
          env.otherOperatingSystemsInstructionMode!=='CONCEPTUAL_ONLY' ||
          env.conceptualExamplesMayRequireExecution!==false ||
          env.optionalExternalToolsRequireWindowsFallback!==true ||
          env.windowsNativeToolsPreferred!==true ||
          env.historicalPublishedResourcesPolicy!=='LEAVE_AS_IS' ||
          env.futureMaterialsPolicy!=='WINDOWS_BASELINE_REQUIRED')
        throw Error('ACADEMIC_ITI_WINDOWS_BASELINE_INVALID');
    }
  }
  return { manifest, digest };
}
export function envelope(manifest,digest) {
  return {source:manifestPath,contractVersion:manifest.contractVersion,manifestSha256:digest,repository:manifest.repository,workflow:manifest.workflow.name,endpoint:manifest.webApp.url};
}
function stripInfrastructureOverrides(value) {
  if (!value || typeof value!=='object') return value;
  if (Array.isArray(value)) return value.map(stripInfrastructureOverrides);
  const blocked=new Set(['endpoint','webAppUrl','transport','workflow','repository','planningSpreadsheetId','planningSource','calendarSelectsClass','scriptId']);
  const out={};
  for (const [key,v] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    out[key]=stripInfrastructureOverrides(v);
  }
  return out;
}
export function prepareRequest(request) {
  const {manifest,digest}=readContext();
  if (!request || typeof request!=='object' || Array.isArray(request)) throw Error('REQUEST_INVALID');
  request=stripInfrastructureOverrides(request);
  const gateway=manifest.operations?.uaqExecutor;
  const routineOps=Array.isArray(gateway?.allowedOperations)?gateway.allowedOperations:[];
  if (routineOps.includes(request.action))
    throw Error('DIRECT_ROUTINE_ACTION_FORBIDDEN_USE_UAQ_EXECUTOR: '+request.action);
  if (request.action==='uaqExecutor') {
    if (!routineOps.includes(request.operation))
      throw Error('UAQ_EXECUTOR_OPERATION_INVALID: '+String(request.operation||''));
    if (request.params && typeof request.params==='object' && request.params.action!==undefined)
      throw Error('UAQ_EXECUTOR_NESTED_ACTION_FORBIDDEN');
  }
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
