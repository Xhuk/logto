# Katra operating map

Facts for the skill. Do not print secret values. If a live id here disagrees with `logto_list_tenants` or `logto_get_application`, trust the MCP.

## Surfaces

Katra is the Logto fork on the VPS. The old OSS IdP is still live and is not Katra.

Pick the row for the process that opens the URL. Copying one row onto another caller breaks login.

| Caller | Endpoint | What is true there |
|--------|----------|--------------------|
| Admin console | `https://katra-imperial.tailfadff7.ts.net:8443` | Tailscale only. The homelab screen where staff logs in to administer or verify. Clients never open it. Tenant `admin`, selector label Admin |
| Staff MCP (Cursor, Codex, any other IDE) | `https://auth.kairova.services/mcp` | Public DNS for the people who operate Katra. Not a product login and not the admin screen |
| Lotly sign-in | `https://lotly.lat/auth` | That product's own DNS. The browser reaches Katra there |
| Propflow sign-in | `https://propflow.kairova.services/auth` | That product's own DNS |
| Vetgroom sign-in | `https://vetgroom.com.mx/auth` | That product's own DNS. No Katra tenant yet |
| Process in the VPS host network namespace | `http://127.0.0.1:13101/{tenantId}` | Host publish `127.0.0.1:13101:3001`. This loopback is Katra only in that namespace |
| Lotly API or web container | Do not set an endpoint | `server/docker-compose.dokploy.yml` uses `network_mode: service:tailscale`. `127.0.0.1` inside that container is the sidecar netns, not host port 13101. Katra publishes 13101 on host loopback only, so the container cannot open it. Neither Tailscale nor `auth.kairova.services` is the product issuer |
| Vite on a developer PC (`web/.env.local`) | The product host the browser opens | This PC's browser cannot open the VPS port 13101. Restart Vite after editing `.env.local` |
| Live Dokploy, Infisical, OpenBao namespace `dokploy` | `https://auth.kairova.services` | Still the old OSS issuer. Leave it until an explicit cutover |

`https://auth.kairova.services/mcp` is the live staff MCP. The same hostname still answers the old OSS IdP on every other path. OAuth login for the MCP uses the admin issuer on Tailscale (`:8443/oidc`). Product issuers stay on each product's `/auth`. Tailscale `:8444/mcp` remains a backup Host alias.

- Public path segment for tenant `admin` is `katra`. A path segment `admin` does not select the control plane.
- With `ADMIN_ENDPOINT` set, console links use the `:8443` host root, not `/admin` or `/katra`.
- Management API audience for a product tenant: `https://{tenantId}.logto.app/api`. Admin audience: `https://admin.logto.app/api`.
- Infra command, same table: `python C:\proyectos\internal-infra\tools\infra-map.py --task logto`.

## Limits

These block Entrar and invites for every caller, including local Lotly.

- Discovery advertises the caller's own host, not the tailnet: `GET https://app.vetgroom.com.mx/auth/oidc/.well-known/openid-configuration` answers `issuer: https://app.vetgroom.com.mx/auth/oidc` (verified 2026-10-17), same for `lotly.lat` and `propflow.kairova.services`. The tenant is resolved by the row in `domains` for that Host; `GET /auth/<tenantId>/oidc/...` is **not** the tenant path — that URL falls through to the experience SPA (HTML 200). Path-based tenancy addresses a tenant as `<endpoint>/<tenantId>` inside the app (`http://127.0.0.1:3001/<tenantId>/api/...`), which is what the MCP uses from outside `/auth`.
- A tenant created through `katra_create_tenant` + `katra_create_domain` is reachable **immediately**, with no DNS record: Traefik already routes `PathPrefix(/auth)` on any product host to Katra, and the domain row comes back `Active`. The CNAME that Katra suggests is informational.
- Product `/auth` OIDC interaction redirects must stay under `/auth` (e.g. `/auth/sign-in`). A host-root `/sign-in` Location drops the browser onto the product SPA with no interaction cookie.
- Experience SSR must inject `pathPrefix: "/auth"` (and rewrite `/assets` URLs). Without it the React router treats `/auth/sign-in` as unknown and shows Logto 404 while `window.logtoSsr` stays `"__LOGTO_SSR__"`. Experience API calls must hit `/auth/api/...` so `Path=/auth` cookies apply.
- Invites need a machine client. `logto_provision_machine_client` creates it and returns client id, secret (once), resource, scope, and the token URL per caller. Until that tool has been run for the tenant, invites cannot request `https://2thyo9.logto.app/api` or `https://3ni0yi.logto.app/api`.

## Staff MCP

- Cursor server `Katra-Mcp`, tools `logto_*`. On the VPS the listener is `:3301` inside the Katra netns (`MCP_HTTP_HOST=0.0.0.0` so Traefik can reach it). The staff URL is `https://auth.kairova.services/mcp`. Tailscale `:8444/mcp` is a backup.
- Codex and any other IDE use this same staff app. They do not use a product `/auth` and they do not use the admin screen as the MCP URL.
- The OAuth login is the authority. `logto_whoami` returns `control-plane` or `tenant-admin`. Control-plane (`default:admin` on Katra) creates machine configs for every tenant. A tenant admin creates them only for tenants where that same person (same id, username, or email) holds `default:admin`.
- Staff machine app lives on the admin tenant. Its endpoint is the `:8443` origin with no `/default`. Role name is exactly `mcp`, type Machine-to-machine, permission `all` on "Logto Management API for tenant admin" only.
- Do not assign `machine:mapi:default`, `machine:mapi:admin`, `tenantApplication`, Logto Me API, or Logto Cloud API to that app.
- Do not start a staff MCP on this PC. The IDE calls the staff MCP URL after the Katra image that contains the MCP is up.
- Cursor OAuth client is the Native app "Cursor staff MCP" `2unzvnybapdrasizxa3nq`, scope `mcp:all`. Resource indicator `https://auth.kairova.services/mcp`. Issuer `https://katra-imperial.tailfadff7.ts.net:8443/oidc` (Tailscale admin OIDC; staff already use Tailscale for the console).
- `logto-mcp-server/.env` is gitignored. Do not commit it. A change to that package ships by rebuilding the Katra image on the VPS.
- Tenant API paths need a base URL that ends with `/`. Without the slash, `api/...` drops the tenant segment and returns 404.

### Second surface: the complete administration MCP

`katra-mcp-server/` (in the repo, not deployed) is a generated server with the whole Management API: 129 tools `katra_*` across 15 domains, spanning `tenants` … `account-center`. Use it when the staff MCP lacks a tool (organization scopes, application-level sign-in experience, organization <-> application links, email templates, JWT customizers, connector testing) and for scripted bootstraps; use the staff MCP for day-to-day IDE work, because it carries an identity (`logto_whoami`) and needs no local credentials.

- It authenticates machine-to-machine from the environment: `KATRA_LOGTO_HOST`, `KATRA_LOGTO_ADMIN_BASE_URL`, `KATRA_LOGTO_CLIENT_ID`/`_SECRET` (same app as the staff MCP, role `mcp`), optional `KATRA_LOGTO_TENANT_ID`, `KATRA_LOGTO_TENANT_ENDPOINTS`. Never put those values in chat or in the repo.
- Tenant-scoped tools take `tenantId`; control-plane tools always address the admin host. A tenant on its own custom domain needs an entry in `KATRA_LOGTO_TENANT_ENDPOINTS`.
- Its HTTP listener has **no authentication of its own**: bind it to loopback (or the tailnet) and keep the credentials in the process environment; do not publish it on a public Traefik route.
- Regeneration steps (spec → curation → descriptions → emission → codemod) and the DeepSeek key trap are in `katra-mcp-server/generator/README.md`.
- Local wiring: `src/bridge.ts` (stdio → HTTP) reads the credentials from `katra-mcp-server/.env` (gitignored) and starts the server on demand. Registered as `Katra-Mcp-Admin` in Cursor and `katra-admin` in Codex; Reasonix needs `reasonix mcp add katra-admin -- "<node>" "<pkg>/node_modules/tsx/dist/cli.mjs" "<pkg>/src/bridge.ts"`. The first call of a session waits a few seconds for the server.

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

Confirm with the MCP before writing. As of 2026-10-17:

| Tenant | Id | App | App id | Type | Login today |
|--------|----|-----|--------|------|-------------|
| Lotly | `3ni0yi` | Lotly | `crjxk9ds8d0ef0hmv15sp` | SPA | Katra, own wordmark |
| Lotly-localhost | `2thyo9` | Lotly-localhost | `9wboyu3mmz44emr4akonm` | SPA | Katra (dev) |
| Propflow | `g6qx2x` | Propflow | `eynkdofswm7jwo39u3t98` | Traditional | Katra, fixed 2026-10-17 |
| KSH | `94zk5v` | KSH | `r9jh2yvopv6gp2r9lyku9` | Traditional | **old OSS Logto**; Katra client ready |
| VetGroom | `5lkfax` | VetGroom SaaS | `49tl064h4i3fhrxb8lshk` | Traditional | Katra wired 2026-10-17, app pending |

- Only Propflow, Lotly and VetGroom consume Katra. **VetGroom prod/demo/offers still have no IdP in their env** (own auth: `ADMIN_KEY`, `DEMO_ACCESS_TOKEN`, licenses); `demo.vetgroom.com.mx/` answers 401 JSON by design.
- KSH runs on the old OSS: `LOGTO_ISSUER=https://auth.kairova.services/oidc`, app `5dfzbkwu0gjgxygpsqhk5`. Its Katra tenant/resources exist but nothing points there yet (cutover below).
- VetGroom (`5lkfax`): **demo first, web after** — the founder's order. Two hosts resolve the same tenant, each with its **own issuer**: `app.vetgroom.com.mx` (`domains` row Active) and `demo.vetgroom.com.mx` (`40lzgdjpnxes1nrqa4cs0`, Active since 2026-10-17). So the demo validates `iss=https://demo.vetgroom.com.mx/auth/oidc` and the web validates `iss=https://app.vetgroom.com.mx/auth/oidc`; both redirect URIs (`/auth/callback` per host) are already registered on the one app.
- VetGroom resources: resource `https://app.vetgroom.com.mx/api` + scopes `read:clinic` / `manage:clinic` / `manage:staff`, organizations per clinic (`Fergon Vet` `16ar8carat4z`, `Syba Vet` `4x1iz8gxc840`, `Demo Vet` `po4ckty5x8wi`), org roles `owner` / `vet` / `staff`. Demo user `fergon.test@vetgroom.local` (`52xm4280xw1n`) is `owner` of Fergon. The client secret is **not minted yet**; config lives in OpenBao `vetgroom/kv/integrations/katra`. `idToken.enabledExtendedClaims` already carries `roles`, `organizations`, `organization_roles`.
- Demo gate caveat: `/demo/*` and the app root sit behind `DemoAccessGateMiddleware` (`demo_access` cookie). The OIDC callback on the demo host must stay reachable — a visitor who lost the cookie and lands on `/auth/callback` gets the 401/`DEMO_TOKEN_REQUIRED` JSON, so check `isDemoGateExempt` before blaming the IdP.
- The OIDC claim for an organization-scoped access token is `organization_id` (not `org_id`), and it only appears when the token request carries **both** `resource` and `organization_id`. ID-token claims come from `urn:logto:scope:organizations` (`organizations`, `organization_data`) and `urn:logto:scope:organization_roles`.
- No product tenant uses organizations yet except VetGroom: Propflow resolves the venture from its own `project_members` table keyed by `logto_user_id`, so an IdP migration there means remapping that column (done for `g6qx2x`: `a9h4nty3gy5m` → `z848mdrk6oy9`).

- Lotly redirects: `https://lotly.lat/callback`, `https://www.lotly.lat/callback`, `https://lotly.lat/entrar`. Post-logout: `https://lotly.lat/`, `https://www.lotly.lat/`. CORS: those two origins.
- Lotly-localhost redirects and post-logout: `localhost` and `127.0.0.1`, ports `5188` and `5190`, paths `/callback` and `/`.
- Propflow redirect: `https://propflow.kairova.services/callback`. Post-logout: `https://propflow.kairova.services/`.
- Product users use username `Xhuk` (case-sensitive) and primary email `jesus.cruzado@gmail.com`. Their user ids differ from the admin user. Password key: `XHUK_APP_PASSWORD`.
- Sign-in methods on the three product tenants: username+password and email+password. Sign-up identifiers: username only.
- Admin-tenant user stays username `Xhuk` without that email unless the person asks to set it there.
- Ana, Habi, and Carza exist only on the old IdP.

## Sign-in screen branding

The access screen is painted per tenant, so a product must never show the IdP's brand. What each one renders as of 2026-10-17:

| Tenant | Logo | Notes |
|--------|------|-------|
| `3ni0yi` Lotly | `https://lotly.lat/brand/lotly-wordmark.png` | plus `customCss` that draws the wordmark (the `identifier` page does not render `logoUrl`) |
| `5lkfax` VetGroom | `https://app.vetgroom.com.mx/vetgroom-logo.png` | |
| `g6qx2x` Propflow | Katra SVG | brand is the "Propflow" CSS wordmark; `customCss` hides the header `img` |
| `94zk5v` KSH | `https://ksh.networkvoid.xyz/decoy/logo-ksh.png` | plus `customCss` with the tagline "sistema de cobranza en ruta" |
| `admin` | `assets/branding/katra-logo.svg` | the console screen people recognize as "Katra" |

- Never leave `https://logto.io/logo.svg` (the default) as a product value: that is the "why does the login still look like Logto" report.
- `hideLogtoBranding` is **not supported in this build**: `sign_in_exp` answers 400 `Hide Logto branding is not supported in this environment` (Cloud-only feature). The footer is `<LogtoSignature>` inside `layoutClassNames.signature`, so hide it with `customCss`: `.logto_signature{display:none !important;}` (applied to all four product tenants). Do not remove a tenant's existing CSS — `customCss` is a full replace, read then append.
- `customCss` is a full replace and **another agent or session may be writing the same field for the same tenant**: on `94zk5v` a concurrent edit (the KSH tagline) silently dropped the footer rule. Always read → concatenate → write, then read back to confirm both pieces survived.
- `GET /auth/brand/logo` (commit `d4c90424d`, **deploy pending**) is the endpoint with fallback: it tries `https://<tenant host>/brand/logo.png`, accepts only `content-type: image/*` (an SPA shell answers HTML 200), gives the product 800 ms, and otherwise serves the Katra SVG embedded in `koa-brand-logo.ts`. It only fetches when the request Host is the tenant's registered domain, so a path-based tenant request cannot turn it into an open proxy. With it, `branding.logoUrl` can be the same value for every tenant.
- The sign-in page is Logto's UI because Katra *is* the fork; "it looks like Logto" almost always means `logto.io` as `logoUrl`, not a wrong IdP. Verify the IdP with the issuer in the discovery document or the address bar, not with the screen.
- `login_hint` + `identifier` are the "you already know who is signing in" contract: with them the authorize redirects to `/auth/identifier-sign-in` and only the password is asked; without them `/auth/sign-in` asks username **and** password in one step. Nothing to configure — if a product asks for both when it already knows the username, it is not sending `login_hint`.

## Vault

OpenBao at `http://127.0.0.1:8200`. Root namespace and namespace `dokploy` are different stores.

| Namespace | Path | Holds |
|-----------|------|--------|
| root | `kv/projects/katra/secrets` | Staff M2M material, `XHUK_USERNAME`, `XHUK_APP_PASSWORD` |
| root | `kv/projects/propflow/secrets` | `KATRA_TENANT_ID`, `KATRA_LOGTO_ENDPOINT`, `KATRA_LOGTO_APP_ID`, `KATRA_LOGTO_APP_SECRET` |
| root | `kv/projects/lotly/secrets` | `KATRA_TENANT_ID`, `KATRA_LOGTO_ENDPOINT`, `KATRA_LOGTO_APP_ID`, `KATRA_LOGTO_M2M_CLIENT_ID`, `KATRA_LOGTO_M2M_CLIENT_SECRET`, `KATRA_LOGTO_M2M_RESOURCE`, `KATRA_LOGTO_M2M_TOKEN_ENDPOINT`, `KATRA_LOGTO_M2M_ROLE` |
| `dokploy` | `kv/projects/lotly/secrets`, `kv/projects/propflow/secrets` | Live product env including Lotly `LOGTO_M2M_*` |

`bao kv patch` adds keys. Do not replace the whole secret. Do not echo values whose names omit SECRET, PASSWORD, or TOKEN; a database URL has leaked that way before.

## Tenant seed

`logto_create_tenant` (control-plane library `createTenant`) seeds the new tenant inside one transaction: OIDC keys, sign-in experience, account center, and the two Console configs `adminConsole` and `idToken`. `logto db seed` writes those two configs for `default` and `admin` only, and the Console reads them through the Management API of the tenant it displays: a missing row answers 404 (`entity.not_found`) and the Console toasts "The resource does not exist." (Organizations placeholder, Sign-in experience, Developers → Custom JWT). The seed ships with the image, so a change there needs the Katra image rebuilt before it applies to new tenants.

Tenants created before `fix(katra): seed the console configs for new tenants` (`cf11dd6d8`) lack both rows: `2thyo9`, `3ni0yi`, `g6qx2x`, `94zk5v` (KSH). Backfill once, idempotent, from the Katra Postgres container:

```sh
docker exec -i <katra-postgres> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
insert into logto_configs (tenant_id, key, value)
select t.id, v.key, v.value
from tenants t
cross join (values
  ('adminConsole', '{"signInExperienceCustomized":false,"organizationCreated":false}'::jsonb),
  ('idToken', '{"enabledExtendedClaims":["roles","organizations","organization_roles"]}'::jsonb)
) as v(key, value)
on conflict (tenant_id, key) do nothing;
SQL
```

Then `logto_configs` holds both keys for every tenant. Do not add other `logto_configs` keys by hand.

## Provision a product

1. `logto_list_tenants`. Create only if that product tenant is absent.
2. Create the app with the redirect and post-logout URIs the product already uses. SPA and Native get no client secret. Traditional and Machine-to-machine get one secret, stored once.
3. Create the sign-in user. Search before creating. Set email only when asked. To allow email login, add an email method to `sign_in` and leave `sign_up` unchanged unless verify is turned on.
4. Store secrets under root `KATRA_*` keys. Leave `dokploy` and Infisical until cutover.

## Cutover

Run this only after an explicit request to point the product at Katra.

- Apply the caller table. Lotly production tenant `3ni0yi`, app `crjxk9ds8d0ef0hmv15sp`. Lotly-localhost tenant `2thyo9`, app `9wboyu3mmz44emr4akonm`. A file on the developer PC does not change Dokploy, Infisical, or the OpenBao `dokploy` namespace.
- Read the Limits section before telling someone Entrar or invites will work.
- Lotly invites call resource `https://3ni0yi.logto.app/api` via admin-tenant M2M `Lotly API` (`machine:mapi:3ni0yi`). Token URL is Tailscale admin OIDC; Management API calls stay on `https://lotly.lat/auth/api`. OpenBao: root and `dokploy` `kv/projects/lotly/secrets`.
- Propflow on the VPS follows the same caller table. App `eynkdofswm7jwo39u3t98`. Secret key `KATRA_LOGTO_APP_SECRET`. Keep `LOGTO_BASE_URL` as `https://propflow.kairova.services`. The old secret does not work on Katra.
- Replace only `LOGTO_*` lines in Dokploy env. Do not dump the env.

### KSH to Katra (prepared 2026-10-17, not executed)

KSH is the last consumer of the old OSS. It runs as a **compose project** (`ksh-lx8hkd`: `com.docker.compose.project=ksh-lx8hkd`, `com.docker.compose.service=api`, no swarm label, and `docker service ls` lists no `ksh`), so `docker service update` answers "No such service". The env is changed in **Dokploy** (project `ksh`, compose `wEsNdl7t93Eu3iOddvd8F`) and redeploy — or edit the compose `.env` and `docker compose up -d` in that directory. Anything patched only inside the running container is reverted by the next deploy.

`ksh-lx8hkd-api` env to change: `LOGTO_ISSUER=https://ksh.networkvoid.xyz/auth/oidc`, `LOGTO_INTERNAL_URL=https://ksh.networkvoid.xyz/auth`, `LOGTO_APP_ID=r9jh2yvopv6gp2r9lyku9`, `LOGTO_APP_SECRET` (backup in OpenBao `ksh/kv/cutover-katra`). Unchanged: `LOGTO_AUDIENCE=https://ksh.networkvoid.xyz/api` (resource exists in `94zk5v`), `LOGTO_REDIRECT_URI`, `LOGTO_JWKS_ALGORITHM=ES384` (Katra serves EC/ES384/P-384), `LOGTO_TOKEN_TYPES`, `LOGTO_SCOPE`.

- Data step in the same window: `update cobradores set logto_sub='w00u0wnjz9zl' where logto_sub='a9h4nty3gy5m';` (one row — the founder). KSH authorizes by `sub`, so without this it authenticates but finds no collector. `logto_sub` is the only identity to remap: `created_by` in `clientes`/`prestamos`/`abonos` is who created the row, `audit_log.p_actor_sub` is the log, and `idempotency_keys` are uuids.
- Trap: `import.service.ts` upserts collectors with `ON CONFLICT (tenant_id, logto_sub)`, so an import still carrying the **old** `sub` after the remap would create a duplicate collector. Today the `sub` comes from the session; state it in the checklist anyway.
- Pre-existing, not Katra: `/ops-console-<hash>` answers `302 Location: http://ksh.networkvoid.xyz/api/auth/login` **on https**, and the scheme does not follow `X-Forwarded-Proto`. The API answers `401` for that path from inside the container, so the redirect comes from `ksh-gateway` (nginx): look for an absolute `return 302 http://…`, `error_page 401`, or `auth_request`. The `ksh-gateway` rebuild already in the window is the moment to make it relative (`/api/auth/login`) or `$scheme`.
- `/brand/logo.png` already exists on KSH (nginx `location =`, `200 image/png`, `no-store`) as a hot-patch, so the upcoming `GET /auth/brand/logo` will pick the real logo instead of falling back; the `ksh-gateway` rebuild turns that patch into a baked image.
- No user migration: tenant `94zk5v` already holds the account with a password. The old OSS has only that account plus four `@lotly.test` test users.
- Rollback: revert the four env vars (originals in `ksh/kv/production`) and the `sub`.
- Rotate in the same window: the old OSS Postgres password (it leaked into a transcript on 2026-10-17). Same path holds `POSTGRES_USER`/`POSTGRES_PASSWORD`; the DB publishes no ports and lives only in `compose-quantify-optical-transmitter-bylqzk_default`, so the change is `ALTER USER` + `DB_URL` in `/etc/dokploy/compose/compose-quantify-optical-transmitter-bylqzk/code` + restart (~30-60 s of KSH downtime).

## Deploy and stale docs

- Dokploy project `katra`, compose `katra-idp`. This branch does not auto-deploy. A console change is live only after `compose.deploy` and the bundle hash changes. The rebuild is the whole `pnpm -r build` on the VPS: ~15 min.
- **Pending deploy** as of 2026-10-17: only `d4c90424d` (`GET /auth/brand/logo` with the Katra fallback). The `no-store` fix `031810170` is **already live** (the deployed image is `b839db9d0`; verified: `/auth/sign-in` on both product hosts sends `Cache-Control: no-store`). The brand endpoint goes out with the KSH cutover window.
- Same window, outside Katra: rebuild `ksh-gateway` **locally** (Docker Desktop → GHCR → Dokploy) so `/brand/logo.png` and the `/decoy/*` route stop being a hot-patch inside the running container.
- Propflow findings worth not re-investigating (`propflow-web`, branch `xhuk-propflow-logto-signin-route`): `@logto/next/server-actions` `signIn`/`signOut` inside a Next 15 **server action** dies with `Error: Connection closed.` — the login must be a route handler with the edge client (`/login/start`, `/callback`, `/logout`). It is not a Katra problem.
- `docs/katra/cutover-plan.md` and `docs/katra/migration.md` still say the staff path is `/admin` and that Applications always writes to `default`. The selected tenant is the write target. The public path is `/katra`.
