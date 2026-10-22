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
  'Update canonical Web App deployment',
  'Verify deployed Web App without creating resources'
];
for(const name of gated){
  const escaped=name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  assert.match(workflow,new RegExp('- name: '+escaped+'\\n\\s+if: steps\\.source_gate\\.outputs\\.needs_deploy'));
}
assert.match(workflow,/\.platform-changes\/\*\*/);
console.log('PASS: Apps Script deployment is gated on actual Apps Script source changes; Cloud Run-only commits never trigger clasp.');
