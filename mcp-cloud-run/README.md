# Google Classroom MCP adapter — Cloud Run (initial implementation)

This independent adapter does **not** modify Apps Script or its canonical deployment. It exposes three MCP tools: `gateway_status`, `diagnosticar_clase`, and a **disabled-by-default** `ejecutar_operacion_academica`. No direct Classroom/Forms APIs or alternate academic algorithms are implemented here.

## Deploy prerequisites

1. Confirm Google Cloud project, billing, Cloud Run permissions, and the ChatGPT environment's actual MCP authentication support.
2. Secure the **upstream Apps Script WebApp first**. The current Apps Script deployment uses `ANYONE_ANONYMOUS` and runs as owner; authenticating this MCP adapter does NOT prevent callers from bypassing it. Do not enable writes until this exposure is remediated in a separately authorized and tested platform change.
3. Use Secret Manager for `MCP_BEARER_TOKEN`. A shared bearer token works only for clients able to set an Authorization header; ChatGPT custom connectors may require OAuth instead. This is not a claim of ChatGPT connector compatibility.
4. Configure environment variable `ACADEMIC_WEBAPP_URL` to the verified canonical URL. Do not store credentials in the repo.
5. Deploy source from the `mcp-cloud-run` directory (Node 22 runtime) to Cloud Run. Example after authenticating gcloud:

```sh
gcloud run deploy academic-classroom-mcp --source ./mcp-cloud-run --region us-central1 --set-env-vars ENABLE_ACADEMIC_WRITES=false
```

Supply `ACADEMIC_WEBAPP_URL` as configuration and `MCP_BEARER_TOKEN` from Secret Manager. Choose an ingress/auth design compatible with your MCP client and do not expose the service publicly without application-layer authentication.

## Protocol and test plan

- `GET /healthz` is a basic liveness response, not proof of Classroom connectivity.
- `POST /mcp` requires Bearer authorization and implements Streamable HTTP.
- Run `npm install && npm run check` in this directory.
- Test MCP initialize, tools/list, unauthorized rejection, and `gateway_status`.
- Test `diagnosticar_clase` against a real course with the canonical `operationalContext`. This context is produced by the existing Academic Web App workflow and validated upstream; do not fabricate hashes or context fields.
- Enable academic writes only after identity, authorization, replay protection, DRAFT, IDs, idempotency, no-duplicate behavior, and postflight verification pass.
- The upstream can redirect HTTP requests and respond with non-JSON login/error pages; failures are surfaced as errors, not success.

## Safety boundary

This adapter **does not fix** direct anonymous access to the Apps Script endpoint. That issue must be addressed at the canonical service boundary. Keep `ENABLE_ACADEMIC_WRITES=false` until remediated.
