import fs from 'node:fs';
import path from 'node:path';

const fail = [];
const root = process.cwd();

const manifest = JSON.parse(fs.readFileSync(path.join(root,'config/academic-context.json'),'utf8'));
const appsscript = JSON.parse(fs.readFileSync(path.join(root,'src/appsscript.json'),'utf8'));
const contract = fs.readFileSync(path.join(root,'src/00_ContratoArquitectura.gs'),'utf8');

if (manifest.rules?.alternativeRoutesAllowed !== false) fail.push('manifest must keep alternativeRoutesAllowed=false');
if (manifest.rules?.routeResolution !== 'MANIFEST_OPERATION_ONLY') fail.push('manifest must keep MANIFEST_OPERATION_ONLY');
for (const [name, op] of Object.entries(manifest.operations || {})) {
  const expected = name === 'quizAsistencia' ? 'FAST_PATH_WEB_APP' : 'ACADEMIC_WEB_APP';
  if (op.executionRoute !== expected) fail.push(`operation ${name} has non-canonical route ${op.executionRoute}`);
}
if (Object.prototype.hasOwnProperty.call(appsscript,'executionApi')) fail.push('src/appsscript.json must not expose executionApi');

const requiredContract = [
  /REMOTE_TRANSPORT:\s*'WEB_APP'/,
  /ROUTE_SOURCE:\s*'MANIFEST_OPERATION'/,
  /ALTERNATIVE_REMOTE_TRANSPORT_ALLOWED:\s*false/,
  /DIRECT_GOOGLE_API_WORKFLOWS_ALLOWED:\s*false/,
  /ONE_OFF_ACADEMIC_GENERATORS_ALLOWED:\s*false/,
  /RECOVERY_POLICY:\s*'CANONICAL_ROUTE_ONLY'/
];
if (requiredContract.some(re => !re.test(contract))) fail.push('architecture contract is missing anti-divergence invariants');

const workflowsDir = path.join(root,'.github','workflows');
const allowedWorkflows = new Set([
  'academic-webapp.yml',
  'deploy-apps-script.yml',
  'validate-minimal-academic-operations.yml'
]);
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
for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.gs'))) {
  const text = fs.readFileSync(path.join(srcDir,file),'utf8');
  const examFns = [...text.matchAll(/function\s+(crearExamen[A-Za-z0-9_]+)\s*\(/g)].map(m=>m[1]);
  for (const fn of examFns) if (fn !== 'crearExamen') fail.push(`${file}: one-off exam generator ${fn}`);
}

const forbiddenLegacyPaths = [
  '.automation',
  '.attendance-requests',
  '.clasp-inspect',
  'docs/execution-api-architecture.md'
];
for (const p of forbiddenLegacyPaths) if (fs.existsSync(path.join(root,p))) fail.push(`legacy path present: ${p}`);

if (fail.length) {
  console.error('Architecture boundary violations:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Architecture boundaries OK: one manifest route, one Web App transport, no one-off execution paths.');
