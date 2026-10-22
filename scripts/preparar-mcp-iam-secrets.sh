#!/usr/bin/env bash
set -euo pipefail
# Safe, idempotent provisioning of METADATA ONLY for the independent MCP.
# NEVER reads or writes a secret version. No Classroom or Cloud Run changes.
PROJECT=classroom-mcp-512122
DEPLOYER="classroom-mcp-deployer@$PROJECT.iam.gserviceaccount.com"
RUNTIME="classroom-mcp-sa@$PROJECT.iam.gserviceaccount.com"
D_MEMBER="serviceAccount:$DEPLOYER"
R_MEMBER="serviceAccount:$RUNTIME"
if [[ "${1:-}" != "--apply" ]]; then
  cat <<'INFO'
USO: bash scripts/preparar-mcp-iam-secrets.sh --apply
Acciones idempotentes de infraestructura:
- Crear sólo las fichas (sin versiones/valores) de los dos secretos nuevos, si faltan
- Conceder únicamente Secret Manager Secret Accessor a la cuenta runtime en ambos secretos
- Conceder sólo Service Account User a deployer SOBRE la cuenta runtime, si no existe
NO lee ni escribe valores HMAC/OAuth, NO cambia los 2 servicios Cloud Run y NO toca Classroom.
INFO
  exit 0
fi
command -v gcloud >/dev/null || { echo "FALTA gcloud (abrir Cloud Shell)"; exit 1; }
command -v jq >/dev/null || { echo "FALTA jq (abrir Cloud Shell)"; exit 1; }
ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
[[ -n "$ACCOUNT" ]] || { echo "NO_GOOGLE_CLOUD_AUTH"; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT" ]] ||
  { echo "Selecciona antes el proyecto: gcloud config set project $PROJECT"; exit 1; }
gcloud iam service-accounts describe "$DEPLOYER" --project "$PROJECT" >/dev/null
gcloud iam service-accounts describe "$RUNTIME" --project "$PROJECT" >/dev/null
echo "Proyecto: $PROJECT"
echo "Cuenta activa de Cloud Shell: $ACCOUNT"
echo "Conservando servicios Cloud Run existentes y clave del Gateway anterior."
for secret in academic-write-hmac academic-mcp-allowed-subjects; do
  if gcloud secrets describe "$secret" --project "$PROJECT" >/dev/null 2>&1; then
    echo "YA EXISTE la ficha de secreto: $secret"
  else
    gcloud secrets create "$secret" --project "$PROJECT" --replication-policy=automatic --quiet --format=none
    echo "CREADA ficha SIN VALOR: $secret"
  fi
  # Least privilege: ONLY the new secret's metadata access policy.
  current="$(gcloud secrets get-iam-policy "$secret" --project "$PROJECT" --format=json)"
  if jq -e --arg member "$R_MEMBER" \
    '.bindings[]? | select(.role=="roles/secretmanager.secretAccessor") | .members[]? | select(.==$member)' \
    <<<"$current" >/dev/null; then
    echo "Secret Accessor ya existe para runtime: $secret"
  else
    gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT" \
      --member="$R_MEMBER" --role=roles/secretmanager.secretAccessor --quiet --format=none
    echo "CONCEDIDO Secret Accessor a runtime en: $secret"
  fi
done
sa_policy="$(gcloud iam service-accounts get-iam-policy "$RUNTIME" --project "$PROJECT" --format=json)"
if jq -e --arg member "$D_MEMBER" \
  '.bindings[]? | select(.role=="roles/iam.serviceAccountUser") | .members[]? | select(.==$member)' \
  <<<"$sa_policy" >/dev/null; then
  echo "Deployer YA tiene Service Account User sobre runtime."
else
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --project "$PROJECT" \
    --member="$D_MEMBER" --role=roles/iam.serviceAccountUser --quiet --format=none
  echo "CONCEDIDO Service Account User a deployer sobre runtime."
fi
echo "METADATOS E IAM CONFIGURADOS. No se creó ninguna versión ni valor secreto."
echo "Falta provisionar el HMAC académico original de forma segura y el sub real del proveedor OAuth."
