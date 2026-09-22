# Katra operating map

Facts for the skill. Do not print secret values. If a live id here disagrees with `logto_list_tenants` or `logto_get_application`, trust the MCP.

## Surfaces

Katra is the Logto fork on the VPS. The old OSS IdP is still live and is not Katra.

Pick the row for the process that opens the URL. Copying one row onto another caller breaks login.

| Caller | Endpoint | What is true there |
|--------|----------|--------------------|
| Admin console | `https://katra-imperial.tailfadff7.ts.net:8443` | Tailscale. Admin login. Tenant `admin`, selector label Admin |
| IDE MCP (Cursor, Codex, any other IDE) | `https://katra-imperial.tailfadff7.ts.net:8444/mcp` | Tailscale Serve into the Katra netns. OAuth issuer stays the admin console `:8443` |
| Process in the VPS host network namespace | `http://127.0.0.1:13101/{tenantId}` | Host publish `127.0.0.1:13101:3001`. This loopback is Katra only in that namespace |
| Lotly API or web container | Do not set an endpoint | `server/docker-compose.dokploy.yml` uses `network_mode: service:tailscale`. `127.0.0.1` inside that container is the sidecar netns, not host port 13101. Katra publishes 13101 on host loopback only, so the container cannot open it. `katra-imperial` stays off the product endpoint |
| Vite on a developer PC (`web/.env.local`) | Do not set the VPS loopback | The value is what the browser opens. This PC's browser cannot open the VPS port 13101. Restart Vite after editing `.env.local` |
| Live Dokploy, Infisical, OpenBao namespace `dokploy` | `https://auth.kairova.services` | Unchanged until an explicit cutover |

- Public path segment for tenant `admin` is `katra`. A path segment `admin` does not select the control plane.
- With `ADMIN_ENDPOINT` set, console links use the `:8443` host root, not `/admin` or `/katra`.
- Management API audience for a product tenant: `https://{tenantId}.logto.app/api`. Admin audience: `https://admin.logto.app/api`.
- Infra command, same table: `python C:\proyectos\internal-infra\tools\infra-map.py --task logto`.

## Limits

These block Entrar and invites for every caller, including local Lotly.

- Discovery advertises `https://katra-imperial.tailfadff7.ts.net/oidc/auth`. That URL returns 404. The route that exists is `/{tenantId}/oidc/auth`. The Lotly SDK follows the advertised URL, so Entrar does not finish until that document publishes the tenant path for the caller that fetched it.
- Invites need a machine client. `logto_provision_machine_client` creates it and returns client id, secret (once), resource, scope, and the token URL per caller. Until that tool has been run for the tenant, invites cannot request `https://2thyo9.logto.app/api` or `https://3ni0yi.logto.app/api`.

## Staff MCP

- Cursor server `Katra-Mcp`, tools `logto_*`. On the VPS the listener is `127.0.0.1:3301` inside the Katra netns, published only as `https://katra-imperial.tailfadff7.ts.net:8444/mcp`.
- Codex and any other IDE use this same admin Tailscale issuer and staff app. They do not use the product localhost.
- The OAuth login is the authority. `logto_whoami` returns `control-plane` or `tenant-admin`. Control-plane (`default:admin` on Katra) creates machine configs for every tenant. A tenant admin creates them only for tenants where that same person (same id, username, or email) holds `default:admin`.
- Staff machine app lives on the admin tenant. Its endpoint is the `:8443` origin with no `/default`. Role name is exactly `mcp`, type Machine-to-machine, permission `all` on "Logto Management API for tenant admin" only.
- Do not assign `machine:mapi:default`, `machine:mapi:admin`, `tenantApplication`, Logto Me API, or Logto Cloud API to that app.
- Do not start a staff MCP on this PC. The IDE calls `https://katra-imperial.tailfadff7.ts.net:8444/mcp` after the Katra image that contains the MCP is up.
- Cursor OAuth client is the Native app "Cursor staff MCP" `2unzvnybapdrasizxa3nq`, scope `mcp:all`. Resource `https://katra-imperial.tailfadff7.ts.net:8444/mcp`. Issuer `https://katra-imperial.tailfadff7.ts.net:8443/oidc`.
- `logto-mcp-server/.env` is gitignored. Do not commit it. A change to that package ships by rebuilding the Katra image on the VPS.
- Tenant API paths need a base URL that ends with `/`. Without the slash, `api/...` drops the tenant segment and returns 404.

## Read with the MCP

The Live records table is a cache. Call the tools. A control-plane login can read every tenant. A tenant admin only receives the tenants in `logto_whoami` `access.tenantIds`.

| Value to share | Tool |
|----------------|------|
| Who this login may configure | `logto_whoami` |
| Tenant id and tag | `logto_list_tenants` or `logto_get_tenant` |
| App id, type, redirect URIs, post-logout URIs, CORS | `logto_list_applications` with `tenant_id`, then `logto_get_application` |
| Sign-in username and email | `logto_list_users` with `tenant_id`. Search the username before creating |
| Sign-in methods | `logto_get_sign_in_experience` with `response_format: "json"` |
| Machine client id, resource (`aud`), scope, token URL per caller | `logto_provision_machine_client`. Omit `resource_indicator` for `https://{tenantId}.logto.app/api` and scope `all` |
| Client secret | Only the first `logto_provision_machine_client` response, or `rotate_secret: true` when asked. Store it in OpenBao. Share the key name |
| SPA or Native app | `logto_get_application`. Those types have no client secret. Do not call the machine-client tool for them |

Share tenant id, app id, type, redirect URIs, username, email, resource, and scope. Do not share the secret or the password. Do not invent `LOGTO_ENDPOINT` from this table. The caller table and the Limits section still say which hosts exist. If the caller's row says not to set an endpoint, the packet stays without one.

## Live records

Confirm with the MCP before writing. As of 2026-09-21:

| Tenant | Id | App | App id | Type |
|--------|----|-----|--------|------|
| Lotly | `3ni0yi` | Lotly | `crjxk9ds8d0ef0hmv15sp` | SPA |
| Lotly-localhost | `2thyo9` | Lotly-localhost | `9wboyu3mmz44emr4akonm` | SPA |
| Propflow | `g6qx2x` | Propflow | `eynkdofswm7jwo39u3t98` | Traditional |

- Lotly redirects: `https://lotly.lat/callback`, `https://www.lotly.lat/callback`, `https://lotly.lat/entrar`. Post-logout: `https://lotly.lat/`, `https://www.lotly.lat/`. CORS: those two origins.
- Lotly-localhost redirects and post-logout: `localhost` and `127.0.0.1`, ports `5188` and `5190`, paths `/callback` and `/`.
- Propflow redirect: `https://propflow.kairova.services/callback`. Post-logout: `https://propflow.kairova.services/`.
- Product users use username `Xhuk` (case-sensitive) and primary email `jesus.cruzado@gmail.com`. Their user ids differ from the admin user. Password key: `XHUK_APP_PASSWORD`.
- Sign-in methods on the three product tenants: username+password and email+password. Sign-up identifiers: username only.
- Admin-tenant user stays username `Xhuk` without that email unless the person asks to set it there.
- Ana, Habi, and Carza exist only on the old IdP.

## Vault

OpenBao at `http://127.0.0.1:8200`. Root namespace and namespace `dokploy` are different stores.

| Namespace | Path | Holds |
|-----------|------|--------|
| root | `kv/projects/katra/secrets` | Staff M2M material, `XHUK_USERNAME`, `XHUK_APP_PASSWORD` |
| root | `kv/projects/propflow/secrets` | `KATRA_TENANT_ID`, `KATRA_LOGTO_ENDPOINT`, `KATRA_LOGTO_APP_ID`, `KATRA_LOGTO_APP_SECRET` |
| `dokploy` | `kv/projects/lotly/secrets`, `kv/projects/propflow/secrets` | Live product env, still the old issuer until cutover |

`bao kv patch` adds keys. Do not replace the whole secret. Do not echo values whose names omit SECRET, PASSWORD, or TOKEN; a database URL has leaked that way before.

## Provision a product

1. `logto_list_tenants`. Create only if that product tenant is absent.
2. Create the app with the redirect and post-logout URIs the product already uses. SPA and Native get no client secret. Traditional and Machine-to-machine get one secret, stored once.
3. Create the sign-in user. Search before creating. Set email only when asked. To allow email login, add an email method to `sign_in` and leave `sign_up` unchanged unless verify is turned on.
4. Store secrets under root `KATRA_*` keys. Leave `dokploy` and Infisical until cutover.

## Cutover

Run this only after an explicit request to point the product at Katra.

- Apply the caller table. Lotly production tenant `3ni0yi`, app `crjxk9ds8d0ef0hmv15sp`. Lotly-localhost tenant `2thyo9`, app `9wboyu3mmz44emr4akonm`. A file on the developer PC does not change Dokploy, Infisical, or the OpenBao `dokploy` namespace.
- Read the Limits section before telling someone Entrar or invites will work.
- Lotly invites call resource `https://default.logto.app/api` in `managementToken()`. The Katra resource is `https://3ni0yi.logto.app/api` (local `https://2thyo9.logto.app/api`).
- Propflow on the VPS follows the same caller table. App `eynkdofswm7jwo39u3t98`. Secret key `KATRA_LOGTO_APP_SECRET`. Keep `LOGTO_BASE_URL` as `https://propflow.kairova.services`. The old secret does not work on Katra.
- Replace only `LOGTO_*` lines in Dokploy env. Do not dump the env.

## Deploy and stale docs

- Dokploy project `katra`, compose `katra-idp`. This branch does not auto-deploy. A console change is live only after `compose.deploy` and the bundle hash changes.
- `docs/katra/cutover-plan.md` and `docs/katra/migration.md` still say the staff path is `/admin` and that Applications always writes to `default`. The selected tenant is the write target. The public path is `/katra`.
