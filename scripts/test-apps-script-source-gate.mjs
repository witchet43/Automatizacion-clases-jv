import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/deploy-apps-script.yml','utf8');
assert.match(workflow,/name: Determine whether canonical Apps Script source changed/);
assert.match(workflow,/id: source_gate/);
assert.match(workflow,/git diff --name-only HEAD\^ HEAD/);
assert.match(workflow,/src\/\|config\/academic-context/);
const gated=[
  'Restore clasp credentials',
  'Enable and list manifest advanced services',
  'Check Apps Script version capacity before mutation',
  'Deploy to Google Apps Script',
  'Update canonical Web App deployment'
];
for(const name of gated){
  const escaped=name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  assert.match(workflow,new RegExp('- name: '+escaped+'\\n\\s+if: steps\\.source_gate\\.outputs\\.needs_deploy'));
}
assert.match(workflow,/\.platform-changes\/\*\*/);
assert.match(workflow,/- name: Verify deployed Web App without creating resources\n\s+run: node scripts\/verify-academic-webapp\.mjs/);
assert.ok(workflow.includes("grep -Fxq '.platform-changes/2026-11-25-canonical-webapp-recovery.json'"));
assert.ok(workflow.includes("echo 'needs_deploy=true'"));
const ci=fs.readFileSync('.github/workflows/validate-minimal-academic-operations.yml','utf8');
assert.match(ci.split('pull_request:')[1].split('workflow_dispatch:')[0],/deploy-apps-script\.yml/);
console.log('PASS: source gate, exact recovery exception and unconditional HTTP postflight.');
