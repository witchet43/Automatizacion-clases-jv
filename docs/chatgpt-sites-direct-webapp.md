# Direct Classroom bridge for a ChatGPT Sites plugin (no GitHub Actions at request time)

## Goal
Build an **owner-private ChatGPT Site with MCP tools** that calls the user's **existing, canonical Google Apps Script WebApp** directly at request time. GitHub is a source-code/configuration store at **build time only**. No GitHub workflow, issue, commit or PR is permitted as the transport for academic operations.

## Source of truth
- Repository: `witchet43/Automatizacion-clases-jv`, `main`.
- Canonical manifest: `config/academic-context.json`.
- Request-envelope generator: `scripts/academic-context.mjs` (`envelope` and `prepareRequest`).
- Canonical WebApp: `webApp.url` from that manifest (not a cloned Apps Script or separate academic executor).
- Existing academic operation for read-only diagnostics: `diagnosticarClase`.
- Never use Calendar or today's date to infer a class, or change the canonical academic workflow.

## Runtime architecture
```
ChatGPT (owner) -> Site-hosted private MCP tool -> HTTPS POST to canonical Apps Script WebApp -> Google Classroom
```
Do not invoke GitHub Actions or query GitHub at runtime, and do not route a request through Cloud Run unless direct WebApp HTTPS proves impossible. Store the canonical WebApp endpoint and the built request envelope as **server-side Site configuration**, never user-editable parameters.

## MCP tools to implement
- `gateway_status`: report backend configuration, tool versions and `writesEnabled: false`. Do not expose secrets or claim Classroom was contacted unless it was.
- `listar_materias`: return the deduplicated `courses` registry from `config/academic-context.json`, keyed by real Classroom `courseId`. Labels may refer to aliases. Clearly say these are configured courses, not every Google Classroom course.
- `diagnosticar_clase`: accept a `courseId` strictly from the registry, plus optional `soloClassroom` (default true), `soloDrafts` (default false). Send one HTTPS POST to WebApp with JSON body:
```json
{
  "action": "diagnosticarClase",
  "courseId": "<actual registered numeric courseId>",
  "soloClassroom": true,
  "soloDrafts": false,
  "operationalContext": {
    "source": "config/academic-context.json",
    "contractVersion": "<manifest.contractVersion>",
    "manifestSha256": "<sha256 of EXACT raw UTF-8 bytes of config/academic-context.json>",
    "repository": "<manifest.repository>",
    "workflow": "<manifest.workflow.name>",
    "endpoint": "<manifest.webApp.url>"
  }
}
```
Read the manifest and calculate `manifestSha256` during Site BUILD/PUBLISH, not in chat and not per invocation. On any canonical manifest update, regenerate configuration and republish Site; reject a mismatching/stale envelope instead of guessing or falling back to GitHub Actions. Use the same response handling as `scripts/execute-academic-request.mjs`: reject HTTP failures, non-JSON and `ok !== true`; surface a sanitized diagnostic error. Do not leak student/student-submission data in logs.

## Security / strict limitations
- Site and its plugin are PRIVATE (owner only); restrict tools by authenticated Site identity.
- WebApp currently runs as its owner with `ANYONE_ANONYMOUS` access. This **is not secured** merely by a private Site. Do **not** enable writes, do not publish any mutation tools, and do not describe this architecture as protecting the WebApp against direct callers. Hardening the canonical WebApp requires a distinct security change that preserves authorized existing clients.
- Never publish credentials, tokens, Cloud Run secrets, OAuth tokens, course data, or API keys in Site source or client UI.
- No new Apps Script deployment, no duplicated academic logic, no silent resource creation, and no modifications to Classroom.
- `DRAFT`, idempotency, explicit authorization and existing canonical `uaqExecutor` remain mandatory prerequisites for any future write action; out of scope for this read-only MVP.
- Do not mix Codebase/platform changes with academic-request commits.

## Acceptance tests (must run from ChatGPT through new Site plugin)
1. `@<the Site's plugin> gateway_status` returns real status, and `writesEnabled: false`.
2. `listar_materias` deduplicates aliases; only actual configured Classroom IDs.
3. `diagnosticar_clase` for Sistemas Distribuidos (`courseId = 871158466533`) returns a live WebApp result with `ok: true`, `diagnostic: true`, `readOnly: true`, containing actual course work. Do not hardcode item counts.
4. Verify **NO GitHub Actions academic request was initiated** by the call.
5. Explicit test of rejected unknown `courseId`; no external URL injection; no write tools; no student data in logs.
6. If tools are not available in ChatGPT, do not claim completion. The Site MUST be published and its generated App/plugin installed/connected before retesting.

## Deployment route
ChatGPT Plus supports Site-hosted MCP plugins on eligible accounts. Create/publish the Site from ChatGPT Desktop **Codex** (or from ChatGPT web Work, if explicitly permitted). The current chat's available tools cannot create/publish Sites. Reuse the prior GitHub connection for one-time reading of this design and the canonical manifest, but do not use it as runtime transport.
