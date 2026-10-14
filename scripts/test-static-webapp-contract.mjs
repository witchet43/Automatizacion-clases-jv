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
  'classPackageCompleteRequiresNotionNotes'
]) assert.equal(manifest.rules[key],true,key);
for(const key of [
  'academicOperationMayModifySource','academicOperationMayModifyWorkflow','academicOperationMayModifyManifest',
  'academicOperationMayDeploy','academicFailureMayTriggerDevelopment','platformChangeMayMixWithAcademicRequest',
  'workModeAllowed','planningGammaStateIsAuthority','gammaArchivedCountsAsPrepared',
  'notionDuplicateNotesAllowed','notionPlanningStateIsAuthority'
]) assert.equal(manifest.rules[key],false,key);
assert.equal(manifest.rules.recoveryRoute,'SAME_CANONICAL_WEB_APP_ONLY');
assert.equal(manifest.rules.gammaLiveEvidenceSource,'GAMMA_LIVE_CONNECTOR');
assert.equal(manifest.rules.gammaPlanningStatusRole,'REFERENCE_ONLY');
assert.equal(manifest.rules.notionNotesRoute,'NOTION_CONNECTOR');
assert.equal(manifest.rules.notionLiveEvidenceSource,'NOTION_LIVE_CONNECTOR');
assert.equal(manifest.rules.classGenerationOrder,'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT');
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
