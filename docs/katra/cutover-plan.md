# Fleet cutover — Katra replaces VPS Logto

Goal: one Katra deployment on the Contabo VPS, N isolated tenants. The current OSS
instance at `https://auth.kairova.services` is the old IdP. It stays up (and stays
public) until every consumer is repointed, then it is turned off.

**Katra itself is not a public attractor.** Console, OIDC, and Management API bind
loopback and are reached only over Tailscale (same posture as today's admin).
Same-VPS backends talk to `127.0.0.1` / Docker DNS — not the open internet.
Public product custom domains (`auth.lotly.lat`, …) are opt-in later, one host at a
time; there is no public `*.idp` wildcard.

This is **recreate, then repoint**. Logto tenant IDs are generated. Users, orgs, and
client secrets are not copied. The staff MCP drives tenants, applications, secrets,
and custom domains. Users and organizations are set up new in the console (MCP has
no user/org tools yet).

Generic image/schema steps: [migration.md](./migration.md).

## Is / is not

**Is**

- Parallel Katra (new Postgres + new image). Old Logto keeps serving.
- Katra ports bound to `127.0.0.1` only; Tailscale Serve for staff/OIDC.
- Path-based multi-tenancy (`PATH_BASED_MULTI_TENANCY=1`) — no public wildcard DNS.
- Console + staff OAuth on Tailscale (`ADMIN_ENDPOINT`).
- New application IDs and secrets; OpenBao / Infisical updated at repoint, not before.
- Papier stays on local Logto until it needs a VPS tenant.

**Is not**

- A second permanent public IdP (“fallback issuer”).
- Public Traefik routes or Cloudflare A records for Katra’s own host.
- In-place mutate of the live `default` tenant as the long-term home of Lotly/Propflow.
- Copying passwords, org membership, or old client secrets.
- Putting `ADMIN_ENDPOINT` on a product host (that host is stolen from tenants).
- Assigning Staff MCP roles to product users.

## Host map (after cut)

| Surface | Host | Tenant | Notes |
|---|---|---|---|
| Old OSS console | `https://dokploy-vps.tailfadff7.ts.net:8443` | OSS `admin` | Tailscale. Keep during overlap. |
| Katra console | `https://dokploy-vps.tailfadff7.ts.net:8444` | `admin` | Tailscale only. Loopback `:13102`. |
| Katra OIDC / MAPI | `https://dokploy-vps.tailfadff7.ts.net:8445` | `ENDPOINT` | Tailscale only. Loopback `:13101`. Path-based tenants. |
| Same-VPS backends | `http://127.0.0.1:13101` | — | Private. No public URL. |
| Lotly (later) | `https://auth.lotly.lat` | `lotly` | Opt-in public custom domain when that product moves. |
| Propflow (later) | public auth host they own | `propflow` | Opt-in. `keivara.services` is NXDOMAIN today. |
| Vetgroom (later) | `https://auth.vetgroom.services` | `vetgroom` | Opt-in when ready. |
| Old IdP | `https://auth.kairova.services` | OSS `default` | Keep public until last consumer leaves. Then retire. |

`auth.kairova.services` after retirement can become a tenant custom domain or stay dark.
Do not make it `ADMIN_ENDPOINT`.

## Inventory — recreate vs new

Live on old VPS `default` (Management API, 2026-09-20):

| Name | Id | Type | Action |
|---|---|---|---|
| Lotly | `igoshdl7wn206rilzihkv` | SPA | Recreate in tenant `lotly`. New id. SPA has no secret. |
| Lotly-localhost | `9u75888n9if37knslegmv` | SPA | Recreate in tenant `lotly-dev` (or same tenant + localhost redirects). |
| Propflow | `blgje6tate4u2aaovlxmh` | Traditional | Recreate in tenant `propflow`. **New secret.** |
| VetGroom Demo | `hus9fg3vvwbsfxb49k2hy` | SPA | Recreate in tenant `vetgroom` when that product is ready. |
| Cursor General | `yuh3mm2mwwh61a4482j3r` | M2M | **New** on Katra `admin` with tenant-management role. Do not reuse on a product tenant. |
| Cursor staff MCP | `9fbdjfni84phx5di7m500` | Native | **New** on Katra `admin`. Product tenants must not get Staff MCP. |

Registry (`C:/proyectos/loginto/apps`), not cloned:

| Item | Why new |
|---|---|
| Lotly orgs `Cumbres Elite`, `Promociones Habi` | MCP has no organization tools. Console in `lotly`. |
| Users `jesus`, `ana`, `habi`, `carza` | MCP has no user tools. Recreate in the Lotly tenant (and staff only on `admin`). |
| papierEboard | Local-only (`localhost:3001`). Skip VPS until they want a tenant. |
| Vetgroom demo user `sybademo` | New password in the Vetgroom tenant. |

## CNAME target (fixed in this fork)

Self-hosted verify used to advertise and check `ENDPOINT`'s hostname. With
`ENDPOINT=https://*.idp.kairova.services` that was the glob `*.idp.kairova.services`.

`resolveCustomDomainCnameTarget` now strips the leading `*.`, or uses
`DOMAIN_CNAME_TARGET` when set. Product auth CNAMEs go to `idp.kairova.services`.

Parallel stack: `docker-compose.katra.parallel.yml` + `.env.katra.parallel.example`
(ports 3101 / 3102 / 3103 so the OSS Logto on 3001/3002 stays up).

## Preconditions

1. Katra image built with `MULTI_TENANCY_ENABLED=1` (build arg).
2. Dokploy project `katra` + compose `docker-compose.katra.vps.yml` + **new** Postgres. Do not point Katra at the old Logto DB.
3. Infisical/OpenBao keys: `ENDPOINT=https://dokploy-vps.tailfadff7.ts.net:8445`, `ADMIN_ENDPOINT=…:8444`, `TENANT_MANAGEMENT_M2M_ROLE_NAMES=mcp`.
4. **No** public Traefik domains and **no** Cloudflare A records for Katra’s own host.
5. Tailscale Serve `:8444` → `127.0.0.1:13102`, `:8445` → `127.0.0.1:13101` (without `serve reset`, so OSS `:8443` stays).
6. Runtime: `PATH_BASED_MULTI_TENANCY=1`, `MULTIPLE_CUSTOM_DOMAINS_ENABLED=1`, `TRUST_PROXY_HEADER=1`.

Done-when: `GET https://dokploy-vps…:8444/oidc/.well-known/openid-configuration` is Katra admin; `…:8445` answers OIDC; old `auth.kairova.services` still answers the OSS issuer; `idp.kairova.services` is not a public Katra route.

## Phase 1 — Deploy Katra beside the old IdP

1. Backup old Postgres (`pg_dump` of current Logto).
2. Deploy Dokploy project `katra` (`docker-compose.katra.vps.yml`). Do not switch `auth.kairova.services` yet.
3. First admin user on Tailscale console `:8444` (new).
4. In **admin** tenant: M2M app + role `mcp` with Management API `all`. Set `TENANT_MANAGEMENT_M2M_ROLE_NAMES=mcp`. Restart once so grants apply.

Done-when: admin M2M obtains a token on the Tailscale issuer; `/api/tenants` lists `default`/`admin` on Katra, not the old host.

## Phase 2 — Point staff MCP at Katra admin

1. `logto-mcp-server` `.env`: `LOGTO_ENDPOINT` + `LOGTO_OIDC_ISSUER` = Tailscale admin. M2M = the new admin client.
2. `LOGTO_TENANT_ENDPOINTS` filled as each custom domain goes Active.
3. Register Cursor Native app **on admin** (`register-cursor-client` with admin M2M). `mcp.json` gets that `CLIENT_ID`.
4. Staff role only on admin users (not Lotly orgs).

Done-when: Cursor Connect logs in on Tailscale; `logto_whoami` + `logto_list_tenants` work.

## Phase 3 — Tenants and applications (MCP)

One tenant at a time. After each create, store the generated tenant id in `loginto/apps/<product>.json`.

### 3a Lotly

1. `logto_create_tenant` name `lotly` tag `production`. Optional `lotly-dev` for localhost SPA.
2. `logto_create_application` SPA `Lotly` — redirects `https://lotly.lat/callback`, `https://www.lotly.lat/callback`.
3. `logto_create_application` SPA `Lotly-localhost` — localhost `:5188` / `:5190`.
4. `logto_set_tenant_features` — keep Organizations **on** for Lotly.
5. DNS: `auth.lotly.lat` CNAME → `idp.kairova.services`. Then `logto_add_domain` + `logto_verify_domain`.
6. Console: recreate orgs + users. New passwords.

Done-when: `https://auth.lotly.lat/oidc/.well-known/openid-configuration` issuer is that host; one test sign-in **before** changing Lotly prod env.

### 3b Propflow

1. `logto_create_tenant` name `propflow` tag `production`.
2. `logto_create_application` Traditional — redirects `https://propflow.kairova.services/callback` (+ localhost if needed).
3. `logto_create_application_secret` — store only in OpenBao `kv/projects/propflow/secrets` and Infisical. Never chat.
4. Organizations feature can stay off if ventures remain the Propflow cookie.
5. Custom domain = the zone they actually control (not NXDOMAIN `keivara.services` unless they register it).
6. Console: staff user(s) for Propflow only.

Done-when: issuer on that custom domain; secret sitting in OpenBao; no prod env change yet.

### 3c Vetgroom

1. `logto_create_tenant` name `vetgroom`.
2. Recreate SPA + `auth.vetgroom.services` when they want that host live.
3. Demo user new.

Done-when: domain Active or tenant parked with no public DNS if Vetgroom is not ready.

### 3d Papier

Skip VPS. Local Logto remains `localhost:3001` until they ask for a tenant.

## Phase 4 — Repoint consumers (one product per change)

Order: Lotly-localhost (dev) → Lotly prod → Propflow → Vetgroom.

For each:

1. Write new `LOGTO_ENDPOINT` / app id / secret to OpenBao ± Infisical.
2. Update `loginto/apps/<product>.json`.
3. Redeploy the product.
4. Real sign-in.
5. Only then drop the old app from the mental “still on OSS” list.

Rollback for that product: put the old `auth.kairova.services` values back. The Katra tenant stays.

## Phase 5 — Retire OSS

1. No remaining consumer uses `https://auth.kairova.services/oidc`.
2. Dump old Postgres one last time.
3. Stop the old Dokploy `logto` compose.
4. Optionally attach `auth.kairova.services` as a tenant domain later — not as admin.

## MCP sequence (cheat sheet)

```
logto_create_tenant
logto_create_application          # per app
logto_create_application_secret   # Traditional / M2M only
logto_set_tenant_features
logto_add_domain
logto_verify_domain
# console: users + organizations
# then repoint product env
```

`LOGTO_TENANT_ENDPOINTS=<id>=https://auth.lotly.lat,...` after each domain is Active.

## Risks

| Risk | Mitigation |
|---|---|
| Two issuers if Tailscale and a public admin host both serve staff OAuth | One staff issuer: Tailscale. Public hosts are product tenants only. |
| CNAME verify against `*.idp…` | Fixed: advertise/check `DOMAIN_CNAME_TARGET` or the glob with `*.` stripped. |
| `ADMIN_ENDPOINT` on `auth.kairova.services` | Keep admin on Tailscale. |
| Staff MCP role on Lotly users | Role only on admin tenant. |
| Secret leak during recreate | Values only in OpenBao/Infisical; MCP prints secret once. |
| Overlap of two consoles on `:8443` | New Serve port for Katra admin during parallel run, or cut console after phase 1 smoke. |
| In-place upgrade temptation | Rejected for first cut: old DB stays the rollback. |

## Done-when (fleet)

- Three product issuers (Lotly, Propflow, Vetgroom-when-ready) are custom domains on Katra.
- Staff MCP lists tenants and can create apps without touching OSS.
- `auth.kairova.services` is no longer any product `LOGTO_ENDPOINT`.
- Old compose stopped; backup retained.
