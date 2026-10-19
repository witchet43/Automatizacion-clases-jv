import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync('config/academic-context.json','utf8'));
const academic=fs.readFileSync('.github/workflows/academic-webapp.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-apps-script.yml','utf8');
const agents=fs.readFileSync('AGENTS.md','utf8');
const readme=fs.readFileSync('README.md','utf8');
const architecture=fs.readFileSync('docs/academic-webapp-architecture.md','utf8');
const validate=fs.readFileSync('.github/workflows/validate-minimal-academic-operations.yml','utf8');

assert.equal(manifest.operatingModel,'STATIC_WEB_APP_SERVICE');
for(const key of [
  'staticWebAppDuringAcademicOperations','academicOperationsAreDataOnly','contentIsDataNotCode',
  'platformChangeRequiresExplicitUserAuthorization','platformChangeEvidenceRequired',
  'gammaLiveVerificationRequiredBeforeReuse','gammaLiveSearchBeforeCreate',
  'gammaPostGenerationReadRequired','gammaActiveCanonicalOnlyCountsAsVerified',
  'notionNotesRequiredForClassPackage','notionLiveVerificationRequired',
  'notionSearchBeforeCreate','notionPostCreateFetchRequired',
  'notionExactCanonicalTitleRequired','notionGammaReferenceRequiredWhenApplicable',
  'classPackageCompleteRequiresNotionNotes','courseEnvironmentProfileRequiredBeforeContentDesign',
  'introTiWindowsBaselineRequired'
]) assert.equal(manifest.rules[key],true,key);
for(const key of [
  'academicOperationMayModifySource','academicOperationMayModifyWorkflow','academicOperationMayModifyManifest',
  'academicOperationMayDeploy','academicFailureMayTriggerDevelopment','platformChangeMayMixWithAcademicRequest',
  'workModeAllowed','planningGammaStateIsAuthority','gammaArchivedCountsAsPrepared',
  'notionDuplicateNotesAllowed','notionPlanningStateIsAuthority','introTiPracticalMultiOsAllowed'
]) assert.equal(manifest.rules[key],false,key);
assert.equal(manifest.rules.recoveryRoute,'SAME_CANONICAL_WEB_APP_ONLY');
assert.equal(manifest.rules.routineMutationGateway,'DIRECT_WEB_APP');
assert.equal(manifest.rules.routineMutationExternalAction,'DIRECT_WEB_APP_ACTION');
assert.equal(manifest.rules.directRoutineMutationRequestAllowed,true);
assert.equal(manifest.rules.routineOperationSourceInspectionAllowed,false);
assert.equal(manifest.rules.routineOperationWorkflowInspectionAllowed,false);
assert.equal(manifest.rules.routineOperationMaxAcademicRequests,1);
assert.equal(manifest.rules.routineOperationPostflightMode,'BUILT_IN_RESULT');
assert.equal(manifest.rules.routineOperationAlternativeRouteAllowed,false);
assert.equal(manifest.rules.routineOperationGatewayFailureBehavior,'BLOCK_NO_ALTERNATE_ROUTE');
assert.equal(manifest.operations.uaqExecutor.gateway,true);
for(const op of manifest.operations.uaqExecutor.allowedOperations){
  assert.equal(manifest.operations[op].externalRequestAllowed,true,op+' externalRequestAllowed');
  assert.equal(manifest.operations[op].internalGateway,'DIRECT_WEB_APP',op+' internalGateway');
}
assert.equal(manifest.rules.gammaLiveEvidenceSource,'GAMMA_LIVE_CONNECTOR');
assert.equal(manifest.rules.gammaPlanningStatusRole,'REFERENCE_ONLY');
assert.equal(manifest.rules.notionNotesRoute,'NOTION_CONNECTOR');
assert.equal(manifest.rules.notionLiveEvidenceSource,'NOTION_LIVE_CONNECTOR');
assert.equal(manifest.rules.classGenerationOrder,'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT');
assert.equal(manifest.rules.introTiOtherOsInstructionMode,'CONCEPTUAL_ONLY');
assert.equal(manifest.rules.introTiHistoricalPublishedResourcesPolicy,'LEAVE_AS_IS');
assert.equal(manifest.rules.introTiFutureMaterialsPolicy,'WINDOWS_BASELINE_REQUIRED');
const iti=manifest.courses['introduccion-tecnologias-informacion'];
assert.equal(iti.studentEnvironmentProfile.profileId,'ITI_WINDOWS_BASELINE_V1');
assert.equal(iti.studentEnvironmentProfile.requiredPlatform,'WINDOWS');
assert.equal(iti.studentEnvironmentProfile.requiredStudentEnvironment,'ONE_WINDOWS_COMPUTER');
assert.equal(iti.studentEnvironmentProfile.practicalWorkMustBeCompletableOnWindows,true);
assert.equal(iti.studentEnvironmentProfile.evidenceMustBeCollectableOnWindows,true);
assert.equal(iti.studentEnvironmentProfile.labDependencyAllowed,false);
assert.equal(iti.studentEnvironmentProfile.secondOperatingSystemRequirementAllowed,false);
assert.equal(iti.studentEnvironmentProfile.linuxSubsystemRequirementAllowed,false);
assert.equal(iti.studentEnvironmentProfile.virtualMachineRequirementAllowed,false);
assert.equal(iti.studentEnvironmentProfile.dualBootRequirementAllowed,false);
assert.equal(iti.studentEnvironmentProfile.multiOperatingSystemPracticalComparisonAllowed,false);
assert.equal(iti.studentEnvironmentProfile.otherOperatingSystemsInstructionMode,'CONCEPTUAL_ONLY');
assert.equal(iti.studentEnvironmentProfile.historicalPublishedResourcesPolicy,'LEAVE_AS_IS');
assert.equal(iti.studentEnvironmentProfile.futureMaterialsPolicy,'WINDOWS_BASELINE_REQUIRED');
assert.equal(manifest.platformChange.deployTrigger,'PLATFORM_CHANGE_EVIDENCE_ONLY');
assert.equal(manifest.platformChange.updateExistingDeploymentOnly,true);
assert.equal(manifest.platformChange.newDeploymentAllowed,false);
assert.equal(manifest.platformChange.workModeAllowed,false);
for(const [name,op] of Object.entries(manifest.operations)){
  assert.equal(op.contentIsData,true,name+' contentIsData');
  assert.equal(op.sourceMutationAllowed,false,name+' sourceMutationAllowed');
  assert.equal(op.deploymentAllowed,false,name+' deploymentAllowed');
}
assert.match(academic,/assert-academic-request-data-only\.mjs/);
const requestGuard=fs.readFileSync('scripts/assert-academic-request-data-only.mjs','utf8');
assert.match(requestGuard,/DIRECT_ROUTINE_ACTION_FORBIDDEN_USE_UAQ_EXECUTOR/);
assert.match(requestGuard,/UAQ_EXECUTOR_OPERATION_INVALID/);
const webSource=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
assert.match(webSource,/ACTIONS:Object\.freeze\(\['resolverClase','diagnosticarClase','auditarIdentidadClassroom','eliminarDrafts','quizAsistencia','actividad','tarea','practica','quiz','examen','material','clase'\]\)/,'direct Web App actions only');
assert.match(webSource,/ROUTINE_OPERATIONS:Object\.freeze/);
assert.match(deploy,/assert-platform-change-authorized\.mjs/);
const onBlock=(deploy.match(/on:[\s\S]*?concurrency:/)||[''])[0];
assert.match(onBlock,/\.platform-changes\/\*\*/);
assert.doesNotMatch(onBlock,/src\/\*\*|config\/academic-context\.json|workflow_dispatch/);
assert.match(validate,/fetch-depth:\s*2/);
assert.match(validate,/assert-platform-change-authorized\.mjs/);
for(const text of [agents,readme,architecture]){
  assert.match(text,/STATIC_WEB_APP_SERVICE/);
  assert.match(text,/data-only/i);
  assert.match(text,/Work mode/i);
  assert.match(text,/fallo|failure/i);
}
console.log('PASS: Web App estática, operaciones data-only y deployment exclusivo por cambio de plataforma autorizado.');
