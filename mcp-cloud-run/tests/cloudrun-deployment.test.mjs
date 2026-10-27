import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCloudRunDeployment} from '../server.mjs';

test('Cloud Run deployment inspection uses runtime identity, never exposes token',async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
   calls.push({url,headers:opts.headers});
   if(url.startsWith('http://metadata.'))return {ok:true,json:async()=>({access_token:'private-access-token'})};
   return {ok:true,json:async()=>({
     latestCreatedRevision:'academic-classroom-mcp-oauth-00012',
     latestReadyRevision:'academic-classroom-mcp-oauth-00012',
     template:{containers:[{image:'us-docker.pkg.dev/project/image@sha256:abcdef'}]},
     trafficStatuses:[{revision:'academic-classroom-mcp-oauth-00012',percent:100}],
     conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}]
   })};
 };
 const out=await describeCloudRunDeployment({fetcher,env:{MCP_DEPLOY_COMMIT:'test-commit'}});
 assert.equal(calls.length,2);
 assert.match(calls[1].url,/run.googleapis.com\/v2\/projects\/classroom-mcp-512122\/locations\/us-central1\/services\/academic-classroom-mcp-oauth/);
 assert.equal(out.traffic[0].percent,100);
 assert.equal(out.deploymentCommit,'test-commit');
 assert.equal(JSON.stringify(out).includes('private-access-token'),false);
});
test('Cloud Run inspection reports lack of viewer permission',async()=>{
 const fetcher=async url=>url.startsWith('http://metadata.')
   ?{ok:true,json:async()=>({access_token:'opaque'})}
   :{ok:false,status:403};
 await assert.rejects(()=>describeCloudRunDeployment({fetcher}),/CLOUD_RUN_VIEWER_ACCESS_OR_API_ERROR: 403/);
});
