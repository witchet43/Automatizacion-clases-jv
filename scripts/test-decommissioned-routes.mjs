import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=process.cwd();
const paths=[
 '.academic-requests',
 '.github/workflows/academic-webapp.yml',
 'scripts/assert-academic-request-data-only.mjs',
 'scripts/execute-academic-request.mjs'
];
for(const p of paths)assert.equal(fs.existsSync(p),false,'Retired alternate execution path remains: '+p);
const allowed=fs.readdirSync('.github/workflows').filter(x=>/\.ya?ml$/.test(x)).sort();
assert.deepEqual(allowed,['audit-classroom-mcp-wif.yml','deploy-apps-script.yml','deploy-cloud-run-mcp.yml','validate-minimal-academic-operations.yml']);
const deployment=fs.readFileSync('.github/workflows/deploy-apps-script.yml','utf8');
assert.match(deployment,/assert-platform-change-authorized\.mjs/);
const trigger=(deployment.match(/on:[\s\S]*?concurrency:/)||[''])[0];
assert.match(trigger,/\.platform-changes\/\*\*/);
assert.doesNotMatch(trigger,/\.academic-requests|workflow_dispatch|src\/\*\*/);
const ctx=JSON.parse(fs.readFileSync('config/academic-context.json','utf8'));
assert.equal(ctx.operatingModel,'STATIC_WEB_APP_SERVICE');
assert.equal(ctx.webApp.url.startsWith('https://script.google.com/macros/s/'),true);
assert.equal(ctx.rules.routineMutationGateway,'UAQ_EXECUTOR');
assert.equal(ctx.rules.academicOperationMayDeploy,false);
const site=fs.readFileSync('site-bridge/direct-write-client.mjs','utf8');
assert.match(site,/submitSignedAcademicDraft/);
assert.match(site,/HMAC|hmac/i);
// Manifest metadata cannot change until the Site is republished with the
// newly computed manifest digest. No legacy executable may survive meanwhile.
assert.equal(ctx.workflow.path,'.github/workflows/academic-webapp.yml');
assert.equal(fs.existsSync(ctx.workflow.path),false);
const adapter=fs.readFileSync('mcp-cloud-run/server.mjs','utf8');
assert.match(adapter,/signedClosureRequest/);
assert.match(adapter,/verifyBearer/);
assert.doesNotMatch(adapter,/classroom\.googleapis\.com|forms\.googleapis\.com|script\.googleapis\.com/);
console.log('PASS: retired alternate actions and request files remain absent; independent OAuth MCP proxies only the signed canonical WebApp.');
