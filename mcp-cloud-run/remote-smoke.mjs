import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.GATEWAY_URL;
const token = process.env.MCP_BEARER_TOKEN;
if (!endpoint?.startsWith('https://') || !token) throw new Error('Missing secured smoke-test configuration');
const client = new Client({name:'academic-classroom-remote-smoke',version:'0.1.0'},{capabilities:{}});
const transport = new StreamableHTTPClientTransport(new URL(endpoint),{
  requestInit:{headers:{Authorization:'Bearer '+token}}
});
try {
  await client.connect(transport);
  const {tools} = await client.listTools();
  const names=tools.map(t=>t.name);
  if(!names.includes('gateway_status') || !names.includes('diagnosticar_clase')) {
    throw new Error('Required MCP tools were not advertised');
  }
  const result=await client.callTool({name:'gateway_status',arguments:{}});
  if(result.isError) throw new Error('gateway_status returned error');
  const raw=result.content?.find(v=>v.type==='text')?.text;
  const status=JSON.parse(raw||'null');
  if(status.configured!==true || status.writesEnabled!==false || status.authConfigured!==true) {
    throw new Error('Gateway configuration mismatch: expected configured/read-only/authenticated');
  }
  console.log('MCP HTTPS authenticated initialize, tools/list, gateway_status: PASS');
  console.log('Read-only verified, tool count:',names.length);
} finally {
  await transport.close().catch(()=>{});
}
