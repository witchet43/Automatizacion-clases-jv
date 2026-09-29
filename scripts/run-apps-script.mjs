#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const LEGACY_REQUIRED_ENV = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN'
];

function readClaspCredentials() {
  const raw = String(process.env.CLASPRC_JSON || '').trim();
  if (!raw) return null;
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    fail('CLASPRC_JSON no contiene JSON válido.');
  }
  const token = cfg.token && typeof cfg.token === 'object' ? cfg.token : cfg;
  const oauth = cfg.oauth2ClientSettings && typeof cfg.oauth2ClientSettings === 'object'
    ? cfg.oauth2ClientSettings
    : cfg;
  const refreshToken = String(token.refresh_token || token.refreshToken || '').trim();
  const accessTokenValue = String(token.access_token || token.accessToken || '').trim();
  const expiryDate = Number(token.expiry_date || token.expiryDate || 0);
  const clientId = String(oauth.clientId || oauth.client_id || '').trim();
  const clientSecret = String(oauth.clientSecret || oauth.client_secret || '').trim();
  return {refreshToken, accessTokenValue, expiryDate, clientId, clientSecret};
}

function fail(message, details) {
  if (details) console.error(details);
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {parameters: [], verify: true, devMode: false};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--function') out.functionName = argv[++i];
    else if (value === '--parameters-json') out.parameters = JSON.parse(argv[++i]);
    else if (value === '--deployment-id') out.deploymentId = argv[++i];
    else if (value === '--dev-mode') out.devMode = true;
    else if (value === '--no-verify') out.verify = false;
    else fail(`Argumento no reconocido: ${value}`);
  }
  if (!out.functionName) fail('Falta --function.');
  if (!Array.isArray(out.parameters)) fail('--parameters-json debe ser un arreglo JSON.');
  return out;
}

function readDeploymentId(explicit) {
  if (explicit) return explicit;
  if (process.env.APPS_SCRIPT_DEPLOYMENT_ID) return process.env.APPS_SCRIPT_DEPLOYMENT_ID;
  const config = JSON.parse(fs.readFileSync('.apps-script-deployment.json', 'utf8'));
  if (!config.deploymentId) fail('No hay deploymentId configurado.');
  return config.deploymentId;
}

async function jsonResponse(response, context) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    fail(`${context} devolvió contenido no JSON (HTTP ${response.status}).`, text.slice(0, 1000));
  }
  if (!response.ok) {
    fail(`${context} falló con HTTP ${response.status}.`, JSON.stringify(body, null, 2));
  }
  return body;
}

async function refreshAccessToken(clientId, clientSecret, refreshToken, sourceName) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: params
  });
  const body = await jsonResponse(response, `Renovación OAuth (${sourceName})`);
  if (!body.access_token) fail(`La renovación OAuth de ${sourceName} no devolvió access_token.`);
  return body.access_token;
}

async function accessToken() {
  const clasp = readClaspCredentials();
  if (clasp) {
    if (clasp.refreshToken && clasp.clientId && clasp.clientSecret) {
      return refreshAccessToken(
        clasp.clientId,
        clasp.clientSecret,
        clasp.refreshToken,
        'CLASPRC_JSON'
      );
    }
    if (clasp.accessTokenValue && (!clasp.expiryDate || clasp.expiryDate > Date.now() + 60000)) {
      return clasp.accessTokenValue;
    }
    fail('CLASPRC_JSON existe, pero no contiene credenciales OAuth reutilizables.');
  }

  for (const name of LEGACY_REQUIRED_ENV) {
    if (!process.env[name]) fail(`Falta CLASPRC_JSON y el secreto legado ${name}.`);
  }
  return refreshAccessToken(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    'GOOGLE_OAUTH_* legado'
  );
}

function executionResult(body, functionName) {
  if (body.error) fail(`Apps Script reportó error dentro de la ejecución de ${functionName}.`, JSON.stringify(body.error, null, 2));
  if (body.done !== true) fail(`Apps Script no confirmó done=true para ${functionName}.`, JSON.stringify(body, null, 2));
  if (!body.response || !Object.prototype.hasOwnProperty.call(body.response, 'result')) {
    fail(`Apps Script no devolvió response.result para ${functionName}.`, JSON.stringify(body, null, 2));
  }
  const result = body.response.result;
  if (result && typeof result === 'object' && result.ok === false) {
    fail(`${functionName} devolvió ok=false.`, JSON.stringify(result, null, 2));
  }
  return result;
}

async function run(deploymentId, token, functionName, parameters, devMode) {
  const response = await fetch(`https://script.googleapis.com/v1/scripts/${encodeURIComponent(deploymentId)}:run`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({function: functionName, parameters, devMode})
  });
  const body = await jsonResponse(response, `Execution API (${functionName})`);
  return executionResult(body, functionName);
}

const args = parseArgs(process.argv.slice(2));
const deploymentId = readDeploymentId(args.deploymentId);
const token = await accessToken();
const result = await run(deploymentId, token, args.functionName, args.parameters, args.devMode);

let verification = null;
if (args.verify && args.functionName !== 'verificarEjecucionRemota') {
  verification = await run(
    deploymentId,
    token,
    'verificarEjecucionRemota',
    [{functionName: args.functionName, parameters: args.parameters, result}],
    args.devMode
  );
  if (!verification || verification.ok !== true) {
    fail('La verificación remota no confirmó ok=true.', JSON.stringify(verification, null, 2));
  }
}

console.log(JSON.stringify({ok: true, function: args.functionName, result, verification}, null, 2));
