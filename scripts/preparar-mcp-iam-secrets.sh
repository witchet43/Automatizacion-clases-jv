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
- Comprobar la cuenta Compute existente de Cloud Build, sin crear otra
- Conceder sólo los roles documentados para source deploy: run.sourceDeveloper y serviceusage.serviceUsageConsumer al deployer, run.builder al constructor existente
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

# Source-deploy uses Cloud Build. Audit the existing DEFAULT builder before
# making any changes; never create a third service account automatically.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$PROJECT_NUMBER" == "148028894895" ]] ||
  { echo "PROJECT_NUMBER_MISMATCH: proyecto inesperado; no se modificó IAM."; exit 1; }
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT" >/dev/null 2>&1; then
  echo "BUILD_SERVICE_ACCOUNT_NOT_FOUND: verificar el constructor predeterminado con gcloud builds get-default-service-account."
  echo "No se crean cuentas nuevas ni se cambian servicios."
  exit 1
fi
PROJECT_POLICY="$(gcloud projects get-iam-policy "$PROJECT" --format=json)" ||
  { echo "PROJECT_IAM_READ_DENIED: no se modificó IAM."; exit 1; }
grant_project_role_if_missing() {
  local member="$1" role="$2"
  # A conditional binding does not prove the source deployment can use this role.
  if jq -e --arg member "$member" --arg role "$role" \
    '.bindings[]? | select(.role==$role and (.condition == null)) | .members[]? | select(.==$member)' \
    <<<"$PROJECT_POLICY" >/dev/null; then
    echo "YA EXISTE permiso de proyecto: $role para $member"
  else
    gcloud projects add-iam-policy-binding "$PROJECT" --member="$member" \
      --role="$role" --condition=None --quiet --format=none
    echo "CONCEDIDO permiso de proyecto: $role para $member"
  fi
}
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
# Minimum documented source-build permissions (Google Cloud Run source deploy).
# Project-scoped create permission is needed because the target service is absent.
grant_project_role_if_missing "$D_MEMBER" roles/run.sourceDeveloper
grant_project_role_if_missing "$D_MEMBER" roles/serviceusage.serviceUsageConsumer
grant_project_role_if_missing "serviceAccount:$BUILD_SA" roles/run.builder
echo "METADATOS E IAM CONFIGURADOS. No se creó ninguna versión ni valor secreto."
echo "Falta provisionar el HMAC académico original de forma segura y el sub real del proveedor OAuth."
