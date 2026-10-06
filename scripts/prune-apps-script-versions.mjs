#!/usr/bin/env node
import fs from 'node:fs';

const MAX_VERSIONS = 190;
const KEEP_NEWEST = 20;

function findAuthObject(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.refresh_token === 'string' && typeof value.client_id === 'string') return value;
  for (const child of Object.values(value)) {
    const found = findAuthObject(child);
    if (found) return found;
  }
  return null;
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} -> HTTP ${res.status}: ${body.slice(0,500)}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const clasp = JSON.parse(fs.readFileSync('.clasprc.json','utf8'));
  const auth = findAuthObject(clasp);
  if (!auth) throw new Error('No se encontró refresh_token/client_id en .clasprc.json');
  if (!auth.client_secret) throw new Error('No se encontró client_secret en credenciales clasp');

  const tokenBody = new URLSearchParams({
    client_id: auth.client_id,
    client_secret: auth.client_secret,
    refresh_token: auth.refresh_token,
    grant_type: 'refresh_token'
  });
  const token = await jsonFetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:tokenBody
  });
  if (!token.access_token) throw new Error('OAuth no devolvió access_token');

  const scriptId = JSON.parse(fs.readFileSync('.clasp.json','utf8')).scriptId;
  if (!scriptId) throw new Error('.clasp.json no contiene scriptId');
  const headers = {Authorization:`Bearer ${token.access_token}`};
  const base = `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}`;

  const deployments = [];
  let pageToken = '';
  do {
    const url = new URL(base + '/deployments');
    url.searchParams.set('pageSize','200');
    if (pageToken) url.searchParams.set('pageToken',pageToken);
    const data = await jsonFetch(url, {headers});
    deployments.push(...(data.deployments || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  const protectedVersions = new Set(
    deployments
      .map(d => Number(d?.deploymentConfig?.versionNumber))
      .filter(n => Number.isInteger(n) && n > 0)
  );

  const versions = [];
  pageToken = '';
  do {
    const url = new URL(base + '/versions');
    url.searchParams.set('pageSize','200');
    if (pageToken) url.searchParams.set('pageToken',pageToken);
    const data = await jsonFetch(url, {headers});
    versions.push(...(data.versions || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  versions.sort((a,b) => Number(a.versionNumber) - Number(b.versionNumber));
  console.log(`Apps Script versions before prune: ${versions.length}; deployed/protected: ${protectedVersions.size}`);

  if (versions.length <= MAX_VERSIONS) {
    console.log('No prune required.');
    return;
  }

  const newestToKeep = new Set(
    versions.slice(-KEEP_NEWEST).map(v => Number(v.versionNumber))
  );
  const deletable = versions.filter(v => {
    const n = Number(v.versionNumber);
    return Number.isInteger(n) && !protectedVersions.has(n) && !newestToKeep.has(n);
  });
  const need = versions.length - MAX_VERSIONS;
  if (deletable.length < need) {
    throw new Error(`No hay suficientes versiones no referenciadas para podar con seguridad: se requieren ${need}, disponibles ${deletable.length}`);
  }

  const victims = deletable.slice(0, need);
  console.error('Apps Script reached the version-history limit.');
  console.error('Manual bulk deletion is required in Project History; the public Apps Script API does not expose version deletion.');
  console.error('Suggested oldest unreferenced versions to delete: ' + victims.map(v => v.versionNumber).join(', '));
  throw new Error('APPS_SCRIPT_VERSION_LIMIT_MANUAL_BULK_DELETE_REQUIRED');

}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
