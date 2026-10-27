import test from 'node:test';
import assert from 'node:assert/strict';
import {githubActionsCall} from '../server.mjs';

test('GitHub App access must be configured before any network call', async()=>{
 let calls=0;
 await assert.rejects(()=>githubActionsCall('runs',{},{
   env:{},fetcher:async()=>{calls++;throw Error('network forbidden');}
 }),/GITHUB_APP_CREDENTIALS_NOT_CONFIGURED/);
 assert.equal(calls,0);
});
test('Do not dispatch without explicit authorization',async()=>{
 await assert.rejects(()=>githubActionsCall('dispatch',{confirmar:false},{
   env:{},fetcher:async()=>{throw Error('no');}
 }),/GITHUB_APP_CREDENTIALS_NOT_CONFIGURED/);
});
