# The complete administration MCP (`katra-mcp-server/`)

Two MCP surfaces exist for this deployment. They are not interchangeable — pick by whether a person
is driving and by whether a tool exists.

| | Staff MCP (`logto-mcp-server/`) | Administration MCP (`katra-mcp-server/`) |
| --- | --- | --- |
| Tools | ~50 hand-curated, prefix `logto_` | **129**, prefix `katra_` |
| Where it runs | inside the Katra image on the VPS, `https://auth.kairova.services/mcp` | locally, HTTP `127.0.0.1:3312` (`KATRA_MCP_PORT`) |
| Who authenticates | the person (Cursor OAuth); `logto_whoami` returns the scope | machine-to-machine only, credentials from `katra-mcp-server/.env` |
| Identity of its own | yes (`control-plane` / `tenant-admin`) | none: it acts as whatever the M2M app can do |
| Use it for | day-to-day work, anything a person must verify in the Admin Console | scripted bootstraps, bulk work, or a tool the staff server lacks |

Client registration goes through `katra-mcp-server/src/bridge.ts`, which stays on the operator's PC:
`Katra-Mcp-Admin` in Cursor and `katra-admin` in Codex are already wired; Reasonix needs the one-line
command below once (its config is host-protected).

## How it is wired

`src/bridge.ts` is a stdio → Streamable HTTP bridge: MCP clients that spawn a command cannot talk to
the `mcp-use` HTTP listener directly, so the bridge

1. reads `KATRA_LOGTO_*` from `katra-mcp-server/.env` (gitignored) or the process environment — so
   no credential ever lands in a client configuration;
2. starts the server on demand, detached, when nothing answers on the port;
3. forwards stdio JSON-RPC to `http://127.0.0.1:{KATRA_MCP_PORT}/mcp` and writes replies back.

The first tool call of a session waits a few seconds for the boot. `npm run bridge` runs the bridge
by hand; `npm run dev` serves HTTP directly.

```json
{
  "mcpServers": {
    "Katra-Mcp-Admin": {
      "command": "node",
      "args": ["<pkg>/node_modules/tsx/dist/cli.mjs", "<pkg>/src/bridge.ts"]
    }
  }
}
```

Reasonix registration (its config is host-protected, so a person runs it once):

```powershell
reasonix mcp add katra-admin -- "C:\Program Files\nodejs\node.EXE" "C:\Users\jics\LogtoVo\LogtoVulkan\katra-mcp-server\node_modules\tsx\dist\cli.mjs" "C:\Users\jics\LogtoVo\LogtoVulkan\katra-mcp-server\src\bridge.ts"
```

## Environment contract

| Variable | Required | Meaning |
| --- | --- | --- |
| `KATRA_LOGTO_HOST` | yes | Path-based host root, e.g. `https://katra-imperial.tailfadff7.ts.net` |
| `KATRA_LOGTO_ADMIN_BASE_URL` | yes | Host that serves `/api/tenants`, e.g. the same host on `:8443` |
| `KATRA_LOGTO_CLIENT_ID` / `_SECRET` | yes | The same machine-to-machine app as the staff MCP (role `mcp`, scope `all`) |
| `KATRA_LOGTO_TENANT_ID` | no | Default tenant for tenant-scoped tools (set to `admin`) |
| `KATRA_LOGTO_TENANT_ENDPOINTS` | no | `id=baseUrl,id=baseUrl` for tenants on a custom domain |
| `KATRA_LOGTO_ADMIN_RESOURCE` / `_RESOURCE_TEMPLATE` / `_SCOPE` | no | Audiences and scope (`https://admin.logto.app/api`, `https://{tenantId}.logto.app/api`, `all`) |
| `KATRA_MCP_PORT` | no | Loopback port of the HTTP listener (default `3312`) |

## Tenants

Control-plane tools (tenant management) always address the admin host with the admin audience. Every
other tool takes an optional `tenantId` (defaults to `KATRA_LOGTO_TENANT_ID`) and talks to
`{KATRA_LOGTO_HOST}/{tenantId}` unless `KATRA_LOGTO_TENANT_ENDPOINTS` maps that id. Tokens are
requested per audience and cached until shortly before expiry, so a call to a new tenant costs one
token fetch.

## Tool inventory (129)

- **tenants (8)** — `katra_list_tenants` · `katra_get_tenant` · `katra_create_tenant` · `katra_update_tenant` · `katra_delete_tenant` · `katra_set_tenant_features` · `katra_get_tenant_features` · `katra_set_tenant_suspended`
- **applications (11)** — `katra_list_applications` · `katra_get_application` · `katra_create_application` · `katra_update_application` · `katra_delete_application` · `katra_list_application_secrets` · `katra_create_application_secret` · `katra_update_application_secret` · `katra_delete_application_secret` · `katra_get_application_sign_in_experience` · `katra_update_application_sign_in_experience`
- **users (12)** — `katra_list_users` · `katra_get_user` · `katra_create_user` · `katra_update_user` · `katra_delete_user` · `katra_set_user_password` · `katra_set_user_suspended` · `katra_list_user_roles` · `katra_assign_user_roles` · `katra_remove_user_role` · `katra_get_user_custom_data` · `katra_update_user_custom_data`
- **organizations (16)** — `katra_list_organizations` · `katra_get_organization` · `katra_create_organization` · `katra_update_organization` · `katra_delete_organization` · `katra_list_organization_members` · `katra_add_organization_members` · `katra_remove_organization_member` · `katra_list_organization_member_roles` · `katra_assign_organization_member_roles` · `katra_remove_organization_member_role` · `katra_list_organization_applications` · `katra_add_organization_application` · `katra_remove_organization_application` · `katra_list_organization_application_roles` · `katra_assign_organization_roles_to_application`
- **organization-roles (12)** — `katra_list_organization_roles` · `katra_get_organization_role` · `katra_create_organization_role` · `katra_update_organization_role` · `katra_delete_organization_role` · `katra_list_organization_scopes` · `katra_create_organization_scope` · `katra_update_organization_scope` · `katra_delete_organization_scope` · `katra_list_organization_invitations` · `katra_create_organization_invitation` · `katra_delete_organization_invitation`
- **roles (12)** — `katra_list_roles` · `katra_get_role` · `katra_create_role` · `katra_update_role` · `katra_delete_role` · `katra_list_role_scopes` · `katra_link_role_scope` · `katra_unlink_role_scope` · `katra_assign_role_to_users` · `katra_remove_role_from_user` · `katra_assign_role_to_applications` · `katra_remove_role_from_application`
- **resources (8)** — `katra_list_resources` · `katra_get_resource` · `katra_create_resource` · `katra_update_resource` · `katra_delete_resource` · `katra_set_resource_default` · `katra_list_resource_scopes` · `katra_create_resource_scope`
- **connectors (8)** — `katra_list_connector_factories` · `katra_list_connectors` · `katra_get_connector` · `katra_create_connector` · `katra_update_connector` · `katra_delete_connector` · `katra_test_connector` · `katra_get_connector_authorization_uri`
- **sign-in-experience (13)** — `katra_get_sign_in_experience` · `katra_update_sign_in_experience` · `katra_list_custom_phrases` · `katra_get_custom_phrase` · `katra_upsert_custom_phrase` · `katra_delete_custom_phrase` · `katra_list_custom_profile_fields` · `katra_create_custom_profile_field` · `katra_update_custom_profile_field` · `katra_delete_custom_profile_field` · `katra_list_email_templates` · `katra_replace_email_templates` · `katra_update_email_template_details`
- **configs (8)** — `katra_get_admin_console_config` · `katra_update_admin_console_config` · `katra_get_id_token_config` · `katra_upsert_id_token_config` · `katra_get_oidc_session_config` · `katra_update_oidc_session_config` · `katra_list_jwt_customizers` · `katra_upsert_jwt_customizer`
- **domains (5)** — `katra_list_domains` · `katra_get_domain` · `katra_create_domain` · `katra_verify_domain` · `katra_delete_domain`
- **hooks (5)** — `katra_list_hooks` · `katra_get_hook` · `katra_create_hook` · `katra_update_hook` · `katra_delete_hook`
- **enterprise-sso (6)** — `katra_list_sso_connector_providers` · `katra_list_sso_connectors` · `katra_get_sso_connector` · `katra_create_sso_connector` · `katra_update_sso_connector` · `katra_delete_sso_connector`
- **operations (3)** — `katra_list_audit_logs` · `katra_get_user_count` · `katra_delete_secret`
- **account-center (2)** — `katra_get_account_center` · `katra_update_account_center`

Not exposed on purpose: product/runtime endpoints (experience, my-account, well-known, verifications,
authn, user assets) and everything that needs an end user or the Console in the loop (consent scopes,
access-control rules, protected applications, JIT provisioning, MFA / trusted devices / grants,
personal access tokens, one-time tokens, sentinel activities, CIMD, subject tokens, systems, SAML
applications). Unhide an operation by removing it from the exclusion list in
`katra-mcp-server/generator/curate.py` and re-running the generator.

## Rules

- The HTTP listener has **no authentication of its own**: bind it to loopback (or the tailnet) and
  never publish it on a public Traefik route. The credentials are the only gate.
- Credentials live in `katra-mcp-server/.env` (gitignored) or the process environment. Never write
  them into a client configuration, a commit, or the chat.
- `katra_delete_*` is irreversible (a deleted tenant drops its database role and seed rows; a deleted
  application stops its sessions). Ask before deleting; the Console screen for the same record is the
  place to confirm.
- Missing tenant feature flags mean enabled: send only the flags that must change.
- A tool that returns a secret value does so once (`katra_create_application_secret`). Report where it
  was stored (OpenBao), never the value.

## Recipes

```sh
cd katra-mcp-server
npm ci && npm run typecheck        # tsc --noEmit
npm run smoke -- 94zk5v            # five read-only calls against the live deployment
npm run bridge                     # stdio bridge by hand (same entry the clients use)
```

Probing the HTTP listener directly (no client needed):

```sh
curl -sS -X POST http://127.0.0.1:3312/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  --data-binary '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Regeneration and traps

`katra-mcp-server/generator/` holds the pipeline — trim the deployment's `/swagger.json`
(`/{tenantId}/api/swagger.json`) → map operations to domains → curate → describe per domain →
assemble the tool spec → `mcp-anything build --resume` → codemod (`src/client.ts`, `tenantId`, zod 4).
`generator/README.md` documents it, including the two traps that cost a run each:

- `ANTHROPIC_AUTH_TOKEN` outranks `ANTHROPIC_API_KEY` in the SDK, so a stale value there makes every
  LLM phase fall back silently to the deterministic path;
- the generator's own reshape asks for every tool in one response and overflows past ~279 tools,
  which is why the surface is curated per domain and injected with `assemble.py`.

The canonical DeepSeek key in OpenBao `kv/io-forger/providers/deepseek` is **revoked** (401) as of
2026-10-16; the working key is the one Reasonix uses, in `%APPDATA%\Reasonix\.env`.
