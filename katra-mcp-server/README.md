# katra-mcp-server

Complete administration MCP for the Katra deployment (the self-hosted Logto fork in this repo),
generated from the deployment's own OpenAPI document and curated to **129 tools across 15 domains**.

It is the wide-surface counterpart of [`logto-mcp-server/`](../logto-mcp-server):

| | `logto-mcp-server/` | `katra-mcp-server/` (this package) |
| --- | --- | --- |
| Surface | ~50 hand-curated tools | 129 tools: the whole Management API minus product/runtime endpoints |
| Transport | Streamable HTTP + OAuth, served inside the Katra image at `https://auth.kairova.services/mcp` | Streamable HTTP (`mcp-use`), served wherever the operator runs it |
| Who authenticates | the person (Cursor OAuth); the server keeps the machine-to-machine client | machine-to-machine only: `client_credentials` from the environment |
| Purpose | staff day-to-day work through an IDE | complete, scriptable administration for agents |

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `KATRA_LOGTO_HOST` | yes | Path-based host root, e.g. `https://katra-imperial.tailfadff7.ts.net` |
| `KATRA_LOGTO_ADMIN_BASE_URL` | yes | Host that serves the control plane (`/api/tenants`), e.g. the same host on `:8443` |
| `KATRA_LOGTO_TENANT_ID` | no | Default tenant for tenant-scoped tools |
| `KATRA_LOGTO_TENANT_ENDPOINTS` | no | `id=baseUrl,id=baseUrl` overrides for tenants reachable on a custom domain |
| `KATRA_LOGTO_CLIENT_ID` | yes | Machine-to-machine application id |
| `KATRA_LOGTO_CLIENT_SECRET` | yes | Machine-to-machine application secret |
| `KATRA_LOGTO_ADMIN_RESOURCE` | no | Admin Management API audience (default `https://admin.logto.app/api`) |
| `KATRA_LOGTO_RESOURCE_TEMPLATE` | no | Per-tenant audience (default `https://{tenantId}.logto.app/api`) |
| `KATRA_LOGTO_SCOPE` | no | Space-separated scopes (default `all`) |

Secrets are read from the environment, kept in memory, and never logged or echoed. On the VPS the
machine-to-machine pair lives in OpenBao `kv/projects/katra/secrets`.

## Run

```sh
npm ci
npm run build     # mcp-use build -> .mcp-use/build
npm start         # HTTP on 0.0.0.0:8000
npm run dev       # dev server on 127.0.0.1:3000
```

Register it with an MCP client that speaks streamable HTTP:

```json
{
  "mcpServers": {
    "katra-admin": { "url": "http://127.0.0.1:3000/mcp" }
  }
}
```

### Local registration (stdio bridge)

Clients that spawn a command instead of connecting to a URL (Cursor, Codex, Reasonix) use
`src/bridge.ts`: it reads the credentials from `katra-mcp-server/.env` (gitignored, shown in
`.env`-style below), starts the server on demand, and forwards stdio JSON-RPC to the HTTP endpoint.
That keeps the secrets out of every client configuration.

```sh
# katra-mcp-server/.env
KATRA_LOGTO_HOST=https://<deployment host>
KATRA_LOGTO_ADMIN_BASE_URL=https://<deployment host>:8443
KATRA_LOGTO_CLIENT_ID=<machine-to-machine app id>
KATRA_LOGTO_CLIENT_SECRET=<machine-to-machine app secret>
KATRA_LOGTO_TENANT_ID=admin
KATRA_MCP_PORT=3312
```

```json
{
  "mcpServers": {
    "Katra-Mcp-Admin": {
      "command": "node",
      "args": [
        "<package>/node_modules/tsx/dist/cli.mjs",
        "<package>/src/bridge.ts"
      ]
    }
  }
}
```

The first tool call of a session waits for the server to boot (a few seconds); the server is
detached so it is reused while it lives. `npm run bridge` runs the same thing by hand.

## Tenants

Every tenant-scoped tool takes an optional `tenantId` that defaults to `KATRA_LOGTO_TENANT_ID`.
Control-plane tools (tenant management) always address the admin host. A tenant served on its own
custom domain needs an entry in `KATRA_LOGTO_TENANT_ENDPOINTS`, otherwise the tool builds
`{KATRA_LOGTO_HOST}/{tenantId}`.

## Verify

```sh
npm run typecheck   # tsc --noEmit
npm run smoke       # read-only calls against a live deployment (needs the env above)
```

Verified on 2026-10-16 against the Contabo deployment: `tools/list` returns the 129 tools, and
`katra_list_tenants` (control plane), `katra_list_applications`, `katra_list_domains`,
`katra_get_sign_in_experience` and `katra_list_connectors` (tenant `94zk5v`) returned live data.

## Surface

15 domains: tenants (8), applications (9), users (10), organizations (11), organization-roles (8),
roles (12), resources (8), connectors (6), sign-in-experience (10), configs (6), domains (5),
hooks (5), enterprise-sso (6), operations (3), account-center (2).

Twenty of them are marked *must* in `generator/curated-surface.json` because a bootstrap is
incomplete without them: user custom data, organization scopes, organization ↔ application links,
application-level sign-in experience, connector testing, email templates and JWT customizers.

Deliberately not exposed: the product/runtime endpoints (experience, my-account, well-known,
verifications, authn, user assets) and the corners that need an end user or the Admin Console in
the loop (consent scopes, access-control rules, protected applications, JIT provisioning,
MFA/trusted devices/grants, personal access tokens, one-time tokens, sentinel activities, CIMD,
subject tokens, systems, SAML applications). Add them by unhiding the operation in
`generator/curate.py` and re-running the generator.

## Provenance

The server is generated, not hand-written, and this is how to regenerate it:

1. `generator/trim-spec.py` — fetch `/{tenantId}/api/swagger.json` from the deployment (373
   operations) and keep the 279 administration operations.
2. `generator/map-ops.py` — map every operation to its domain (OpenAPI tag).
3. `generator/curate.py` — select the surface: exclusion list + explicit names, `tier=must` for the
   twenty above. Writes `generator/curated-surface.json`.
4. `generator/describe.py` — write agent-consumer descriptions and parameter hints per domain
   (batched: one LLM call per domain, so no response overflows).
5. `generator/assemble.py` — rebuild the `ServerDesign` (keeping the generator's method/path/parameter
   plumbing), turn telemetry off and inject it into the pipeline manifest.
6. `mcp-anything build --brief generator/brief.yaml --data-source <spec> -o out --target mcp-use
   --resume` — re-emit with the curated surface.
7. `generator/codemod.py` — replace the emitted `fetch` with `src/client.ts` (`apiFetch` adding a
   cached client-credentials bearer token per audience, `baseUrlFor` resolving the tenant), add the
   `tenantId` parameter to tenant-scoped tools, and fix zod 4's `z.record` arity.

`spec/tool-spec.yaml` is the surface as data, `spec/conformance-report.json` the generator's raw
report (C-04…C-23 pass: agent-consumer descriptions, tool groups, Dockerfile, no embedded secrets),
and `SKILL.md` the generated agent-facing guide with every tool and its parameters.
