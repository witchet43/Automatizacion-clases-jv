#!/usr/bin/env bash
# One-time interactive input of an EXISTING HMAC or an OAuth subject.
# Neither the secret nor its fingerprint is printed, stored in a file, or sent to GitHub.
set +x
set -euo pipefail
umask 077
PROJECT="classroom-mcp-512122"
if [[ "$#" -ne 1 ]]; then
  echo "Uso: bash scripts/cargar-mcp-secreto.sh --hmac | --subject"
  exit 2
fi
case "$1" in
  --hmac)
    SECRET="academic-write-hmac"
    PROMPT="Pega el valor EXISTENTE de ACADEMIC_WRITE_HMAC_KEY de Apps Script y pulsa Enter (entrada oculta): "
    ;;
  --subject)
    SECRET="academic-mcp-allowed-subjects"
    PROMPT="Pega el sub REAL del usuario autorizado del proveedor OAuth y pulsa Enter (entrada oculta): "
    ;;
  *)
    echo "MODO_INVALIDO: solo --hmac o --subject"
    exit 2
    ;;
esac
command -v gcloud >/dev/null || { echo "FALTA_GCLOUD: usar Cloud Shell"; exit 1; }
[[ -t 0 ]] || { echo "REQUIERE_TERMINAL_INTERACTIVA: no usar pipes ni GitHub Actions"; exit 1; }
ACTIVE="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
[[ -n "$ACTIVE" ]] || { echo "NO_GOOGLE_CLOUD_AUTH"; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT" ]] ||
  { echo "PROYECTO_INCORRECTO: gcloud config set project $PROJECT"; exit 1; }
# Give the GitHub deployer read-only METADATA access to just these two secrets.
# Secret Manager Viewer cannot access payloads (unlike Secret Accessor).
# Run this preflight before the hidden prompt so auditing works independently.
command -v jq >/dev/null || { echo "FALTA_JQ: usar Cloud Shell"; exit 1; }
DEPLOYER="serviceAccount:classroom-mcp-deployer@$PROJECT.iam.gserviceaccount.com"
for item in academic-write-hmac academic-mcp-allowed-subjects; do
  gcloud secrets describe "$item" --project="$PROJECT" --format='value(name)' >/dev/null
done
for item in academic-write-hmac academic-mcp-allowed-subjects; do
  policy="$(gcloud secrets get-iam-policy "$item" --project="$PROJECT" --format=json)"
  if jq -e --arg member "$DEPLOYER" \
    '.bindings[]? | select(.role=="roles/secretmanager.viewer" and (.condition == null)) | .members[]? | select(.==$member)' \
    <<<"$policy" >/dev/null; then
    echo "METADATOS_YA_AUTORIZADOS: $item"
  else
    gcloud secrets add-iam-policy-binding "$item" --project="$PROJECT" \
      --member="$DEPLOYER" --role=roles/secretmanager.viewer --quiet --format=none
    echo "METADATOS_AUTORIZADOS: $item (sin acceso al valor)"
  fi
done
# Fail closed on ANY pre-existing version, including DISABLED or DESTROYED.
# Use unfiltered version metadata; the state list filter is SDK-dependent.
existing_json="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format=json)"
if jq -e 'length > 0' <<<"$existing_json" >/dev/null; then
  current_state="$(gcloud secrets versions describe latest --secret="$SECRET" --project="$PROJECT" --format='value(state)' 2>/dev/null || true)"
  if [[ "$current_state" == "ENABLED" ]]; then
    echo "YA_EXISTE_VERSION_HABILITADA: $SECRET. Sin cambios; no se subio ningun valor."
    exit 0
  fi
  echo "VERSION_EXISTENTE_REVISAR: $SECRET. Sin cambios; estado latest no confirmado como ENABLED."
  exit 1
fi
VALUE=''
trap 'unset VALUE' EXIT
IFS= read -r -s -p "$PROMPT" VALUE
printf '\n'
if [[ "$1" == "--hmac" ]]; then
  if [[ ${#VALUE} -lt 32 || "$VALUE" == *$'\r'* ]]; then
    echo "HMAC_INVALIDO: longitud minima de 32 caracteres y sin retorno de carro; no se cargo."
    exit 1
  fi
else
  if [[ -z "$VALUE" || "$VALUE" == *','* || "$VALUE" == *$'\r'* || "$VALUE" == *$'\n'* || "$VALUE" == *' '* ]]; then
    echo "SUB_INVALIDO: use exclusivamente el subject real del proveedor, sin comas ni espacios; no se cargo."
    exit 1
  fi
fi
# Never use echo, a command-line argument, an environment variable,
# a temp file, or a here-doc to deliver secret material.
printf '%s' "$VALUE" | gcloud secrets versions add "$SECRET" \
  --project="$PROJECT" --data-file=- --quiet --format='value(name)' >/dev/null
unset VALUE
state="$(gcloud secrets versions describe latest --secret="$SECRET" --project="$PROJECT" --format='value(state)')"
if [[ "$state" != "ENABLED" ]]; then
  echo "VERSION_NO_VERIFICADA: latest no confirmado como ENABLED; no se consulto el valor."
  exit 1
fi
echo "VERSION_HABILITADA_CONFIRMADA: $SECRET (valor NO mostrado)"
