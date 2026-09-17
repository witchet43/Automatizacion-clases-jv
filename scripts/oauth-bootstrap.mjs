#!/usr/bin/env node

import crypto from 'node:crypto';
import http from 'node:http';
import process from 'node:process';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/forms',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/script.send_mail',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.topics'
];

for (const name of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']) {
  if (!process.env[name]) throw new Error(`Falta ${name}.`);
}

const port = Number(process.env.OAUTH_CALLBACK_PORT || 53682);
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const state = crypto.randomBytes(24).toString('hex');
const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.search = new URLSearchParams({
  client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
  redirect_uri: redirectUri,
  response_type: 'code',
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
  scope: SCOPES.join(' '),
  state
}).toString();

console.log('Abre esta URL en el navegador de la misma computadora:');
console.log(auth.toString());
console.log(`Esperando devolución OAuth en ${redirectUri}`);

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/oauth2/callback') return;
    if (url.searchParams.get('state') !== state) {
      res.writeHead(400).end('Estado OAuth inválido.');
      server.close();
      reject(new Error('Estado OAuth inválido.'));
      return;
    }
    if (url.searchParams.get('error')) {
      res.writeHead(400).end('Consentimiento no completado.');
      server.close();
      reject(new Error(url.searchParams.get('error')));
      return;
    }
    const value = url.searchParams.get('code');
    res.writeHead(200, {'content-type':'text/plain; charset=utf-8'}).end('Consentimiento recibido. Ya puedes cerrar esta pestaña.');
    server.close();
    resolve(value);
  });
  server.listen(port, '127.0.0.1');
});

const response = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: {'content-type':'application/x-www-form-urlencoded'},
  body: new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })
});
const body = await response.json();
if (!response.ok || !body.refresh_token) {
  throw new Error(`Intercambio OAuth falló: HTTP ${response.status} ${JSON.stringify(body)}`);
}
console.log('\nGuarda el siguiente valor como GitHub Actions secret GOOGLE_OAUTH_REFRESH_TOKEN.');
console.log('No lo publiques en issues, commits ni logs compartidos.');
console.log(body.refresh_token);
