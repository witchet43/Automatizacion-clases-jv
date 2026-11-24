import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectRun,safeRetry,planRelease} from './release-orchestrator.mjs';
import {compareFiles} from './verify-apps-script-release.mjs';
const sha='a'.repeat(40);
const run={id:3,head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'failure',run_attempt:1};
test('only the newest exact SHA main push is eligible',()=>{
  assert.equal(selectRun([{...run,id:9,head_sha:'b'.repeat(40)},{...run,id:8,event:'pull_request'},
    {...run,id:7,head_branch:'other'},run,{...run,id:4}],sha).id,4);
  assert.equal(selectRun([{...run,head_branch:'test'}],sha),null);
});
test('authorization evidence is required; both deployments reconcile actual source',()=>{
  assert.throws(()=>planRelease(['src/x.gs']),/RELEASE_AUTHORIZATION_EVIDENCE_MISSING/);
  assert.deepEqual(planRelease(['.platform-changes/change.json']),{ci:true,apps:true,cloud:true});
});
test('bounded retries; deployments cannot be repeated after mutation or unknown job state',()=>{
  const before=[{steps:[{name:'Checkout',status:'completed',conclusion:'failure'},
    {name:'Deploy to Google Apps Script',status:'completed',conclusion:'skipped'}]}];
  assert.equal(safeRetry('ci',run,[]),true);
  assert.equal(safeRetry('ci',{...run,run_attempt:2},[]),false);
  assert.equal(safeRetry('apps',run,before),true);
  assert.equal(safeRetry('apps',run,[]),false);
  for(const name of ['Enable and list manifest advanced services','Check Apps Script version capacity before mutation',
    'Deploy to Google Apps Script','Update canonical Web App deployment']){
    assert.equal(safeRetry('apps',run,[{steps:[{name,status:'completed',conclusion:'success'}]}]),false);
    assert.equal(safeRetry('apps',run,[{steps:[{name,status:'in_progress',started_at:'now'}]}]),false);
  }
  assert.equal(safeRetry('cloud',run,[{steps:[{name:'Deploy only new independent MCP adapter',status:'completed',conclusion:'failure'}]}]),false);
  assert.equal(safeRetry('cloud',{...run,conclusion:'success'},before),false);
});
test('deployed content compare tolerates line endings and manifest property order only',()=>{
  const files=[{name:'main',type:'SERVER_JS',source:'const a = 1;\r\n'},
    {name:'appsscript',type:'JSON',source:'{"timeZone":"UTC","dependencies":{}}'}];
  const same=[{name:'appsscript',type:'JSON',source:'{"dependencies":{},"timeZone":"UTC"}'},
    {name:'main',type:'SERVER_JS',source:'const a = 1;\n'}];
  assert.equal(compareFiles(files,same).matches,true);
  assert.equal(compareFiles(files,same).localDigest,compareFiles(files,same).remoteDigest);
  assert.deepEqual(compareFiles(files,[{...same[0]}, {...same[1],source:'const a = 2;'}]).differing,['SERVER_JS:main']);
  assert.equal(compareFiles(files,[same[0]]).matches,false);
  assert.throws(()=>compareFiles(files,[...same,same[0]]),/APPS_SCRIPT_DUPLICATE_FILE/);
});
test('production workflows preserve evidence gates and enforce deployment order',()=>{
  const read=p=>fs.readFileSync(p,'utf8');
  const app=read('.github/workflows/deploy-apps-script.yml'),cloud=read('.github/workflows/deploy-cloud-run-mcp.yml');
  const coordinator=read('.github/workflows/release-orchestrator.yml');
  assert.ok(app.indexOf('gate-ci')<app.indexOf('clasp push --force'));
  assert.ok(app.indexOf('assert-main')<app.indexOf('clasp push --force'));
  assert.ok(cloud.indexOf('gate-apps')<cloud.indexOf('gcloud run deploy'));
  assert.ok(cloud.indexOf('assert-main')<cloud.indexOf('gcloud run deploy'));
  assert.match(app,/verify-apps-script-release\.mjs --plan/);
  assert.match(cloud,/git merge-base --is-ancestor/);
  assert.match(coordinator,/statuses: write/);
  assert.match(coordinator,/actions: write/);
  assert.match(coordinator,/token_format: id_token/);
  assert.match(coordinator,/actions\/upload-artifact@v4/);
  assert.ok(coordinator.indexOf('verify-live-release.mjs')<coordinator.indexOf('release-orchestrator.mjs finalize'));
  assert.doesNotMatch(coordinator,/clasp run|script\.googleapis\.com\/v1\/scripts|classroom\.googleapis\.com/);
});
