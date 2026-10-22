import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync('scripts/cargar-mcp-secreto.sh','utf8');
for (const p of [
  /set \+x/,/set -euo pipefail/,/PROJECT="classroom-mcp-512122"/,
  /SECRET="academic-write-hmac"/,/SECRET="academic-mcp-allowed-subjects"/,
  /\[\[ -t 0 \]\]/,/read -r -s -p/,
  /--filter='state=ENABLED'/,/YA_EXISTE_VERSION_HABILITADA/,
  /printf '%s' "\$VALUE" \| gcloud secrets versions add/,
  /--data-file=-/,/VERSION_HABILITADA_CONFIRMADA/
]) assert.match(s,p);
for (const p of [/gcloud secrets versions access/,/gcloud secrets (create|delete)/,
  /gcloud run (deploy|services)/,/gcloud projects add-iam-policy-binding/,
  /Classroom\./,/assignedGrade/,/set -x/,
  /echo\s+["']?\$VALUE/,/--data-file=\/tmp/])
 assert.doesNotMatch(s,p);
console.log('PASS: secure interactive input only; no secret value in GitHub, command-line arguments, temp file, terminal echo, or logs.');
