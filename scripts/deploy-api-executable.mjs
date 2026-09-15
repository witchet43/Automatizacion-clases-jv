#!/usr/bin/env node

import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const configPath = '.apps-script-deployment.json';
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};
const clasp = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['clasp', 'deploy', '--description', 'Execution API production'];

if (config.deploymentId) args.push('--deploymentId', config.deploymentId);

const output = execFileSync(clasp, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
process.stdout.write(output);

const id = output.match(/-\s+(AKfy[a-zA-Z0-9_-]+)/)?.[1] ||
  output.match(/(AKfy[a-zA-Z0-9_-]{20,})/)?.[1] ||
  config.deploymentId;

if (!id) {
  console.error('No fue posible determinar el deployment ID del ejecutable API.');
  process.exit(1);
}

console.log(`APPS_SCRIPT_DEPLOYMENT_ID=${id}`);
