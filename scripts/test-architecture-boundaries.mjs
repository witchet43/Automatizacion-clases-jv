import fs from 'node:fs';
import path from 'node:path';

const fail = [];
const root = process.cwd();

const manifest = JSON.parse(fs.readFileSync(path.join(root,'config/academic-context.json'),'utf8'));
const appsscript = JSON.parse(fs.readFileSync(path.join(root,'src/appsscript.json'),'utf8'));
const contract = fs.readFileSync(path.join(root,'src/00_ContratoArquitectura.gs'),'utf8');

if (manifest.rules?.alternativeRoutesAllowed !== false) fail.push('manifest must keep alternativeRoutesAllowed=false');
if (manifest.rules?.routeResolution !== 'MANIFEST_OPERATION_ONLY') fail.push('manifest must keep MANIFEST_OPERATION_ONLY');
if (manifest.operatingModel !== 'STATIC_WEB_APP_SERVICE') fail.push('manifest must keep STATIC_WEB_APP_SERVICE');
if (manifest.rules?.staticWebAppDuringAcademicOperations !== true) fail.push('academic Web App must remain static during academic operations');
if (manifest.rules?.academicOperationsAreDataOnly !== true) fail.push('academic operations must be data-only');
if (manifest.rules?.academicOperationMayModifySource !== false ||
    manifest.rules?.academicOperationMayModifyWorkflow !== false ||
    manifest.rules?.academicOperationMayModifyManifest !== false ||
    manifest.rules?.academicOperationMayDeploy !== false)
  fail.push('academic operations must not mutate/deploy platform');
if (manifest.rules?.academicFailureMayTriggerDevelopment !== false) fail.push('academic failure must not authorize development');
if (manifest.rules?.recoveryRoute !== 'SAME_CANONICAL_WEB_APP_ONLY') fail.push('recovery must use same canonical Web App');
if (manifest.rules?.platformChangeRequiresExplicitUserAuthorization !== true ||
    manifest.rules?.platformChangeEvidenceRequired !== true)
  fail.push('platform changes require explicit user authorization evidence');
if (manifest.rules?.platformChangeMayMixWithAcademicRequest !== false) fail.push('platform and academic lanes must be isolated');
if (manifest.rules?.workModeAllowed !== false) fail.push('Work mode must remain forbidden for this project');
if (manifest.rules?.planningGammaStateIsAuthority !== false) fail.push('planning Gamma state must never be authority');
if (manifest.rules?.gammaLiveVerificationRequiredBeforeReuse !== true) fail.push('Gamma reuse must require LIVE verification');
if (manifest.rules?.gammaLiveSearchBeforeCreate !== true) fail.push('Gamma creation must require LIVE search');
if (manifest.rules?.gammaArchivedCountsAsPrepared !== false) fail.push('archived Gamma must not count as prepared');
if (manifest.rules?.gammaLiveEvidenceSource !== 'GAMMA_LIVE_CONNECTOR') fail.push('Gamma LIVE evidence source must be connector');
if (manifest.rules?.gammaPostGenerationReadRequired !== true) fail.push('generated Gamma must be read/verified');
if (manifest.rules?.gammaActiveCanonicalOnlyCountsAsVerified !== true) fail.push('only active canonical Gamma may count as verified');
for (const [name, op] of Object.entries(manifest.operations || {})) {
  const expected = name === 'quizAsistencia' ? 'FAST_PATH_WEB_APP' : 'ACADEMIC_WEB_APP';
  if (op.executionRoute !== expected) fail.push(`operation ${name} has non-canonical route ${op.executionRoute}`);
  if (op.contentIsData !== true || op.sourceMutationAllowed !== false || op.deploymentAllowed !== false)
    fail.push(`operation ${name} must remain data-only and non-deploying`);
}
if (Object.prototype.hasOwnProperty.call(appsscript,'executionApi')) fail.push('src/appsscript.json must not expose executionApi');

const requiredContract = [
  /REMOTE_TRANSPORT:\s*'WEB_APP'/,
  /ROUTE_SOURCE:\s*'MANIFEST_OPERATION'/,
  /ALTERNATIVE_REMOTE_TRANSPORT_ALLOWED:\s*false/,
  /DIRECT_GOOGLE_API_WORKFLOWS_ALLOWED:\s*false/,
  /ONE_OFF_ACADEMIC_GENERATORS_ALLOWED:\s*false/,
  /RECOVERY_POLICY:\s*'CANONICAL_ROUTE_ONLY'/,
  /OPERATING_MODEL:\s*'STATIC_WEB_APP_SERVICE'/,
  /ACADEMIC_OPERATIONS_ARE_DATA_ONLY:\s*true/,
  /ACADEMIC_OPERATION_SOURCE_MUTATION_ALLOWED:\s*false/,
  /ACADEMIC_OPERATION_DEPLOYMENT_ALLOWED:\s*false/,
  /ACADEMIC_FAILURE_GRANTS_DEVELOPMENT_AUTHORIZATION:\s*false/,
  /PLATFORM_CHANGE_REQUIRES_EXPLICIT_USER_AUTHORIZATION:\s*true/,
  /DEPLOY_TRIGGER:\s*'PLATFORM_CHANGE_EVIDENCE_ONLY'/,
  /WORK_MODE_ALLOWED:\s*false/,
  /PLANNING_GAMMA_STATE_IS_AUTHORITY:\s*false/,
  /GAMMA_LIVE_VERIFICATION_REQUIRED_BEFORE_REUSE:\s*true/,
  /GAMMA_LIVE_SEARCH_REQUIRED_BEFORE_CREATE:\s*true/,
  /GAMMA_ARCHIVED_COUNTS_AS_PREPARED:\s*false/,
  /GAMMA_ACTIVE_CANONICAL_ONLY_COUNTS_AS_VERIFIED:\s*true/,
  /GAMMA_POST_GENERATION_READ_REQUIRED:\s*true/
];
if (requiredContract.some(re => !re.test(contract))) fail.push('architecture contract is missing anti-divergence invariants');

const workflowsDir = path.join(root,'.github','workflows');
const allowedWorkflows = new Set([
  'academic-webapp.yml',
  'deploy-apps-script.yml',
  'validate-minimal-academic-operations.yml'
]);
const academicWorkflowText = fs.readFileSync(path.join(workflowsDir,'academic-webapp.yml'),'utf8');
const deployWorkflowText = fs.readFileSync(path.join(workflowsDir,'deploy-apps-script.yml'),'utf8');
if (!academicWorkflowText.includes('assert-academic-request-data-only.mjs')) fail.push('Academic Web App must enforce data-only request commits');
if (!deployWorkflowText.includes('assert-platform-change-authorized.mjs')) fail.push('Deploy must enforce explicit platform-change authorization');
const deployTriggerBlock=(deployWorkflowText.match(/on:[\s\S]*?concurrency:/)||[''])[0];
if (!/\.platform-changes\/\*\*/.test(deployTriggerBlock) || /src\/\*\*|workflow_dispatch/.test(deployTriggerBlock))
  fail.push('Deploy must trigger only from .platform-changes evidence');
for (const file of fs.readdirSync(workflowsDir)) {
  if (!allowedWorkflows.has(file)) fail.push(`non-canonical workflow present: ${file}`);
  const text = fs.readFileSync(path.join(workflowsDir,file),'utf8');
  const forbidden = [
    ['Apps Script Execution API','script.googleapis.com/v1/scripts'],
    ['direct Classroom REST','classroom.googleapis.com/v1'],
    ['direct Forms REST','forms.googleapis.com/v1'],
    ['manual OAuth refresh','oauth2.googleapis.com/token'],
    ['clasp run',/\bclasp\s+run\b/],
    ['new replacement deployment',/\bclasp\s+create-deployment\b/]
  ];
  for (const [label, token] of forbidden) {
    const hit = token instanceof RegExp ? token.test(text) : text.includes(token);
    if (hit) fail.push(`${file}: forbidden ${label}`);
  }
}

const srcDir = path.join(root,'src');
const allowedExamFunctions = new Set(['crearExamen','crearExamenDirecto']);
for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.gs'))) {
  const text = fs.readFileSync(path.join(srcDir,file),'utf8');
  const examFns = [...text.matchAll(/function\s+(crearExamen[A-Za-z0-9_]*)\s*\(/g)].map(m=>m[1]);
  for (const fn of examFns) if (!allowedExamFunctions.has(fn)) fail.push(`${file}: one-off exam generator ${fn}`);
}

const forbiddenLegacyPaths = [
  'src/03_Actividad13YApi.gs',
  'src/07_CalificacionUnidad1.gs',
  'src/17_RepararCerosErroneosActividad.gs',
  'src/19_MigrarActividadCalificacionDraft.gs',
  'src/32_SolicitudEliminarCourseWorkBorrador.gs',
  'src/45_QuizAsistenciaClaseActiva.gs',
  'src/46_UnidadAbiertaQuizSencillo.gs',
  'src/EvaluacionIA.gs',
  'src/ZZ_GitHubPublicacionE2E.gs',
  '.automation',
  '.attendance-requests',
  '.clasp-inspect',
  'docs/execution-api-architecture.md'
];
for (const p of forbiddenLegacyPaths) if (fs.existsSync(path.join(root,p))) fail.push(`legacy path present: ${p}`);

const pipelineSource = fs.readFileSync(path.join(srcDir,'01_PipelineQuizzes.gs'),'utf8');
if (/CourseWork\.create\s*\(/.test(pipelineSource)) fail.push('01_PipelineQuizzes.gs must not create Classroom resources');
if (/function\s+processOneQuiz_\s*\(/.test(pipelineSource)) fail.push('legacy Sheets -> Forms -> Classroom processor must not exist');
if (!/descomisionado:\s*true/.test(pipelineSource)) fail.push('legacy quiz monitor must remain explicitly decommissioned');

const githubGrading = fs.readFileSync(path.join(srcDir,'GitHubCalificaciones.gs'),'utf8');
if (/CourseWork\.patch\s*\(\s*\{state:\s*['"]PUBLISHED['"]/.test(githubGrading)) fail.push('GitHub grading must not auto-publish CourseWork');
if (!/Publicación automática deshabilitada/.test(githubGrading)) fail.push('GitHub grading must preserve DRAFT-only publication policy');

const simulation = fs.readFileSync(path.join(srcDir,'05_SimulacionAdministracion.gs'),'utf8');
const simulationRecalc = fs.readFileSync(path.join(srcDir,'06_RecalculoSimulacionV2.gs'),'utf8');
if (/const\s+SIM_ADM_BOOTSTRAP\s*=/.test(simulation)) fail.push('simulation must not auto-install triggers on source load');
if (/const\s+SIM_V2_BOOTSTRAP\s*=/.test(simulationRecalc)) fail.push('simulation recalculation must not auto-install periodic triggers');

const forbiddenSourceSymbols = [
  'calcularYPublicarCalificacionUnidad1',
  'procesarSolicitudRepararCerosActividad_',
  'procesarSolicitudMigrarActividadCalificacionDraft_',
  'procesarSolicitudEliminarCourseWorkBorrador_',
  'crearQuizDeAsistencia',
  'resolverClaseActivaQuizAsistencia_',
  'resolverUnidadAbiertaQuizSencillo_'
];
for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.gs'))) {
  const text = fs.readFileSync(path.join(srcDir,file),'utf8');
  for (const symbol of forbiddenSourceSymbols) {
    if (text.includes(symbol)) fail.push(`${file}: obsolete source symbol ${symbol}`);
  }
}

if (fail.length) {
  console.error('Architecture boundary violations:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Architecture boundaries OK: one manifest route, one Web App transport, no one-off execution paths.');
