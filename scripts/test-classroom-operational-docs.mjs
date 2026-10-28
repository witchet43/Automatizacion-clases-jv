import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Documentation contract: only the current OAuth/HMAC architecture is the
// operational instruction set. This test never reads credentials or invokes APIs.
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const paths=[
  'docs/CONFIGURACION_PLUGIN_Y_AUTH0.md',
  'docs/CAMBIOS_Y_DESPLIEGUES.md',
  'docs/DIAGNOSTICO_Y_RECUPERACION.md',
  'docs/academic-webapp-architecture.md',
  'README.md','AGENTS.md',
  'mcp-cloud-run/server.mjs',
  '.github/workflows/deploy-apps-script.yml',
  '.github/workflows/deploy-cloud-run-mcp.yml'
];
for(const p of paths)assert.ok(exists(p),'Missing operational source: '+p);

const setup=read(paths[0]),change=read(paths[1]),incident=read(paths[2]);
const readme=read('README.md'),agents=read('AGENTS.md');
const mcp=read('mcp-cloud-run/server.mjs');
const context=JSON.parse(read('config/academic-context.json'));
const mcpWorkflow=read('.github/workflows/deploy-cloud-run-mcp.yml');
const appsWorkflow=read('.github/workflows/deploy-apps-script.yml');
const canonicalBase='https://academic-classroom-mcp-oauth-148028894895.us-central1.run.app';
assert.equal(context.contractVersion,'1.1.0');
assert.ok(setup.includes(canonicalBase+'/mcp'));
assert.ok(setup.includes('https://dev-67cfevmusm7px130.us.auth0.com/'));
assert.ok(setup.includes(context.webApp.scriptId));
assert.ok(mcpWorkflow.includes(canonicalBase));
assert.ok(mcp.includes('academic.read')&&mcp.includes('academic.close_unit'));
assert.ok(mcp.includes('verifyBearer')&&mcp.includes('signedClosureRequest'));
assert.ok(appsWorkflow.includes('CLASPRC_JSON'));
assert.ok(appsWorkflow.includes('clasp push --force'));
assert.ok(appsWorkflow.includes('scripts/verify-academic-webapp.mjs'));
for(const text of [setup,change,incident]){
  assert.ok(text.includes('HMAC'), 'Runbook must explain signature');
  assert.ok(text.includes('OAuth')||text.includes('Auth0'), 'Runbook must explain authentication');
}
for(const filename of paths.slice(0,3)) {
  const basename=path.basename(filename);
  assert.ok(readme.includes(basename),'README missing reference '+basename);
  assert.ok(agents.includes(basename),'AGENTS missing reference '+basename);
}
for(const p of ['docs/chatgpt-sites-direct-webapp.md','docs/site-direct-write-security.md',
                 'docs/cleanup-register-20261020.md','docs/static-webapp-operating-contract.md']) {
  assert.equal(exists(p),false,'Retired operating instructions returned to main: '+p);
}
assert.ok(change.includes('squash'));
assert.ok(change.includes('allowedChangedPaths'));
assert.ok(incident.includes('upstreamHmacAccepted'));
console.log('PASS: Classroom plugin/MCP/Apps Script/WebApp/GitHub operating runbooks match active code and avoid retired routes.');
