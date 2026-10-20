#!/usr/bin/env bash
set -euo pipefail
PROJECT=classroom-mcp-512122
NUMBER=148028894895
POOL=github-classroom-pool
PROVIDER=github
DEPLOYER=classroom-mcp-deployer
ACCOUNT="$DEPLOYER@$PROJECT.iam.gserviceaccount.com"
REPO=witchet43/Automatizacion-clases-jv
gcloud config set project "$PROJECT"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Classroom MCP"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts describe "$ACCOUNT" >/dev/null 2>&1 || gcloud iam service-accounts create "$DEPLOYER" --display-name="GitHub MCP deployer"
gcloud iam service-accounts add-iam-policy-binding "$ACCOUNT" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"
for role in roles/run.developer roles/cloudbuild.builds.editor roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role="$role" --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "classroom-mcp-sa@$PROJECT.iam.gserviceaccount.com" --member="serviceAccount:$ACCOUNT" --role=roles/iam.serviceAccountUser
echo "Google Cloud now trusts GitHub main branch. GitHub workflow becomes usable after merging reviewed PR."
