#!/usr/bin/env bash
set -euo pipefail
# Read-only audit. Never reads secret VALUES, token or IAM credentials.
PROJECT_ID=classroom-mcp-512122
REGION=us-central1
printf '\n=== AUDITORIA NO DESTRUCTIVA: Classroom MCP ===\n'
if ! command -v gcloud >/dev/null 2>&1; then
  echo 'ERROR: ejecutar desde Google Cloud Shell con gcloud.' >&2
  exit 1
fi
printf '\nProyecto: %s\nRegion: %s\n' "$PROJECT_ID" "$REGION"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ ! "$PROJECT_NUMBER" =~ ^[0-9]+$ ]]; then
  echo 'ERROR: no se pudo comprobar el proyecto. Revisa permisos de tu cuenta.' >&2
  exit 1
fi
printf 'Numero de proyecto: %s\n' "$PROJECT_NUMBER"
printf '\n[APIs existentes]\n'
enabled="$(gcloud services list --project="$PROJECT_ID" --enabled --format='value(config.name)' || true)"
for api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com; do
  if grep -qx "$api" <<<"$enabled"; then echo "OK  $api"; else echo "FALTA  $api"; fi
done
printf '\n[Servicios Cloud Run existentes: NO se cambiaran]\n'
for name in academic-classroom-mcp academic-classroom-chatgpt-gateway academic-classroom-mcp-oauth; do
  url="$(gcloud run services describe "$name" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
  if [[ -n "$url" ]]; then printf 'EXISTE  %s  %s\n' "$name" "$url"; else printf 'AUSENTE  %s\n' "$name"; fi
done
printf '\n[Cuentas de servicio: solo existencia]\n'
for name in classroom-mcp-deployer classroom-mcp-sa classroom-mcp-builder; do
  email="$name@$PROJECT_ID.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$email" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf 'EXISTE  %s\n' "$email"
  else
    printf 'AUSENTE  %s\n' "$email"
  fi
done
printf '\n[WIF de GitHub: nombres de pools/proveedores, no tokens]\n'
pools="$(gcloud iam workload-identity-pools list --project="$PROJECT_ID" --location=global --format='value(name)' 2>/dev/null || true)"
if [[ -z "$pools" ]]; then
  echo 'Ningun pool visible (o permisos de lectura insuficientes).'
else
  while IFS= read -r pool; do
    [[ -z "$pool" ]] && continue
    id="${pool##*/}"
    echo "POOL  $id"
    gcloud iam workload-identity-pools providers list --project="$PROJECT_ID" --location=global --workload-identity-pool="$id" --format='value(name)' 2>/dev/null |
      while IFS= read -r provider; do [[ -n "$provider" ]] && echo "  PROVIDER  $provider"; done || true
  done <<<"$pools"
fi
printf '\n[Secret Manager: NOMBRES unicamente. Nunca se leen valores.]\n'
gcloud secrets list --project="$PROJECT_ID" --format='value(name)' 2>/dev/null | while IFS= read -r secret; do
  [[ "$secret" == *mcp* || "$secret" == *academic* || "$secret" == *classroom* ]] && echo "SECRET  $secret"
done || true

printf '\n[VERIFICACION DE PERMISOS PARA GITHUB ACTIONS — SOLO LECTURA]\n'
DEPLOYER="classroom-mcp-deployer@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME="classroom-mcp-sa@$PROJECT_ID.iam.gserviceaccount.com"
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-classroom-pool/providers/github"
printf 'WIF esperado: %s\n' "$WIF_PROVIDER"
condition="$(gcloud iam workload-identity-pools providers describe github \
  --project="$PROJECT_ID" --location=global \
  --workload-identity-pool=github-classroom-pool \
  --format='value(attributeCondition)' 2>/dev/null || true)"
if [[ "$condition" == *"witchet43/Automatizacion-clases-jv"* ]]; then
  echo "OK  Provider WIF restringido al repositorio academico."
elif [[ -z "$condition" ]]; then
  echo "REVISAR  Provider WIF sin condicion visible (o permisos de lectura insuficientes)."
else
  echo "REVISAR  Condicion de WIF: $condition"
fi
printf '\n[Cuenta de despliegue — WIF roles/iam.workloadIdentityUser]\n'
gcloud iam service-accounts get-iam-policy "$DEPLOYER" \
  --project="$PROJECT_ID" --format=json 2>/dev/null | \
  jq -r '.bindings[]? | select(.role=="roles/iam.workloadIdentityUser") | .members[]? | "WIF_MEMBER  "+.' || \
  echo "REVISAR  No se pudo leer la politica de la cuenta deployer."
printf '\n[Roles del proyecto para deployer y runtime — sin credenciales]\n'
gcloud projects get-iam-policy "$PROJECT_ID" --format=json 2>/dev/null | \
  jq -r --arg a "serviceAccount:$DEPLOYER" --arg b "serviceAccount:$RUNTIME" \
  '.bindings[]? | select(any(.members[]?; .==$a or .==$b)) | "IAM_ROLE  "+.role' || \
  echo "REVISAR  No se pudo consultar IAM del proyecto."
printf '\n[Secretos requeridos por el nuevo adaptador — NO se leen valores]\n'
for secret in academic-write-hmac academic-mcp-allowed-subjects; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "OK  $secret"
  else
    echo "FALTA  $secret"
  fi
done
printf '\n=== FIN DE LA AUDITORIA - SIN MODIFICACIONES ===\n'
