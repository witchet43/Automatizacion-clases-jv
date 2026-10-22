import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync('scripts/cargar-mcp-secreto.sh','utf8');
for (const p of [
  /set \+x/,/set -euo pipefail/,/PROJECT="classroom-mcp-512122"/,
  /SECRET="academic-write-hmac"/,/SECRET="academic-mcp-allowed-subjects"/,
  /\[\[ -t 0 \]\]/,/read -r -s -p/,
  /--format=json/,/YA_EXISTE_VERSION_HABILITADA/,
  /printf '%s' "\$VALUE" \| gcloud secrets versions add/,
  /--data-file=-/,/VERSION_HABILITADA_CONFIRMADA/,
  /roles\/secretmanager\.viewer/,/METADATOS_AUTORIZADOS/,
  /gcloud secrets get-iam-policy/,/gcloud secrets add-iam-policy-binding/
]) assert.match(s,p);
for (const p of [/gcloud secrets versions access/,/gcloud secrets (create|delete)/,
  /gcloud run (deploy|services)/,/gcloud projects add-iam-policy-binding/,
  /Classroom\./,/assignedGrade/,/set -x/,
  /echo\s+["']?\$VALUE/,/--data-file=\/tmp/])
 assert.doesNotMatch(s,p);
assert.ok(s.includes('gcloud secrets versions list "$SECRET" --project="$PROJECT" --format=json'));
assert.ok(s.includes('gcloud secrets versions describe latest --secret="$SECRET"'));
assert.ok(s.includes('current_state" == "ENABLED"'));
assert.ok(s.includes('state" != "ENABLED"'));
assert.ok(s.includes("VERSION_EXISTENTE_REVISAR"));
assert.ok(!s.includes("--filter='state=ENABLED'"));
console.log('PASS: hidden input and fail-closed metadata-only secret version checks; no secret payload reads.');
