# Katra IdP — multi-tenant migration runbook

This fork adds multi-tenancy to Logto: one deployment serves N isolated tenants, each with its own
domain, users, applications and sign-in experience, plus per-tenant feature flags managed from the
existing Admin Console.

"Migration" here means moving one or more Logto applications into tenants of a Katra deployment.
Because Logto generates tenant IDs, the migration is: create the tenant (or tenants), recreate the
applications inside it, attach the domain, then repoint the project's configuration. No data is
copied between instances, which is why it is safe to rehearse and to roll back by pointing the
project back at its previous deployment.

## What multi-tenant mode changes

| Concern | Single-tenant | Multi-tenant |
| --- | --- | --- |
| `ENDPOINT` | `https://auth.example.com` | `https://\*.example.com` — the wildcard is what enables domain-based tenancy |
| Tenant addressing | the single endpoint | `<tenantId>.example.com` or a custom domain |
| Console + tenant management API | the main endpoint | `ADMIN_ENDPOINT` |
| Tenant IDs | fixed (`default`) | generated per tenant |

**Keep the console where it is.** The admin endpoints are checked before tenant matching, so setting
`ADMIN_ENDPOINT` to the current console URL keeps it working while tenants move to subdomains:

```
ENDPOINT=https://*.example.com
ADMIN_ENDPOINT=https://auth.example.com
```

Also required:

- `MULTIPLE_CUSTOM_DOMAINS_ENABLED=1` — exposes the tenant management API and the custom domain flow
  without Cloudflare.
- `TENANT_MANAGEMENT_M2M_ROLE_NAMES=<role names>` — the admin-tenant machine-to-machine roles that
  are granted access to every tenant's Management API. Needed for the MCP server (see below).
- `MULTI_TENANCY_ENABLED=1` — a **build** argument for the console bundle, not a runtime variable.

## Verified by local rehearsal

Rehearsed end to end on a fresh database, with domain-based tenancy over `*.lvh.me` (any host under
that domain resolves to `127.0.0.1`), driving the migration through the MCP server:

1. Created tenants `lotly-prod` and `lotly-dev`; Logto generated `a4x0qj` and `rdatub`.
2. Created `lotly` (`Traditional`) in the production tenant and `lotly-localhost` (`SPA`) in the
   development tenant, each through that tenant's own Management API.
3. Created a client secret for `lotly` (`logto_create_application_secret`).
4. Disabled Organizations for `lotly-dev` only — which is the granularity this fork exists for.

Evidence collected afterwards:

- `GET http://<tenant>/oidc/.well-known/openid-configuration` → issuer is the tenant itself.
- `GET http://<tenant>/oidc/jwks` → one `ES384` / `P-384` key: the signing key generated when the
  tenant was created.
- `GET http://<tenant>/api/.well-known/sign-in-exp` → **200** with that tenant's `tenantId`.
- `GET http://<tenant>/api/applications` using a token issued by the admin tenant for
  `https://<tenantId>.logto.app/api` → **200**: one machine-to-machine app can manage every tenant
  without per-tenant credentials.

## Gaps the rehearsal exposed (fixed in this fork)

A tenant created through `POST /api/tenants` used to be listed by the control plane but unusable:

1. **No OIDC configs.** `EnvSet.load` requires `oidc.privateKeys` and `oidc.cookieKeys`, and the OSS
   seed only covers `default` and `admin`. Every request to the new tenant failed with
   "Failed to get configs". `createTenant` now seeds them, with a P-384 key generated per tenant.
2. **No sign-in experience or account center.** Both are read through the well-known cache, whose
   guards reject a missing row, so the sign-in page returned 500. `createTenant` now seeds both.
3. **Not atomic.** A failure part-way through left the tenant row and its database role behind while
   the tenant stayed broken. `createTenant` now runs in a single transaction.
4. **`deleteTenant` leaked tenant-scoped rows** — OIDC configs, sign-in experience, account center
   and the tenant's Management API resource in the admin tenant. All four are now removed.
5. **Machine-to-machine access to tenants.** Creating a tenant exposes its Management API as a
   resource in the admin tenant, but only the console's user role was granted it. Roles listed in
   `TENANT_MANAGEMENT_M2M_ROLE_NAMES` are now granted too, so one M2M app can manage every tenant.
6. **Application secrets are a separate resource.** `POST /api/applications` returns no secret; one
   is created with `POST /api/applications/:id/secrets`. The MCP now exposes that, so app creation
   and credential issuance are both scriptable.

## Migrating the deployment

Substitute your own values. The commands assume the Compose service from
`docker-compose.katra.yml` and a container named after its service.

### 1. Back up first

```sh
docker exec <postgres> pg_dump -U <user> -d <db> -Fc > katra-$(date +%F).dump
```

### 2. Apply the schema change by hand

The pending alterations on this deployment are additive columns, so apply them directly while the
previous instance keeps serving:

```sql
alter table tenants add column if not exists features jsonb not null default '{}'::jsonb;
alter table saml_application_configs add column if not exists authn_request_config jsonb;
```

Then record the state the CLI would have written. Without it the new image refuses to boot with
"Undeployed database alterations found":

```sql
insert into systems (key, value)
values ('alterationState', jsonb_build_object(
  'timestamp', <timestamp of the newest bundled alteration>,
  'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
))
on conflict (key) do update set value = excluded.value;
```

The core compares that timestamp against the scripts it ships (`getAvailableAlterations`), so the
value must match the newest script in `packages/schemas/alterations-js` inside the image.

### 3. Build the image, then deploy it

Build on the host with an explicit `--load` so the image lands in the daemon the containers read
from. A build driven from inside the compose file can end up only in a separate builder store, and
the services then fail with `pull access denied for katra-idp`:

```sh
docker buildx build --load -t katra-idp:master 'https://github.com/<you>/logto.git#master'
docker image inspect katra-idp:master >/dev/null && echo loaded
```

Point the compose `app` service at that image and deploy it. Keep the compose free of `build:` and of
one-shot `backup`/`migrate` services: compose recreates the app container before waiting on a
dependency, so a job that fails takes the app down with it.

Set `NODE_OPTIONS=--max-old-space-size=4096` for the build. The console bundle exceeds Node's default
heap and otherwise aborts with "Ineffective mark-compacts near heap limit".

### 4. Bootstrap the MCP credentials

In the **admin tenant**, create a machine-to-machine application and a role, grant the role the
admin Management API `all` scope, and assign it to the application. Set the role name in
`TENANT_MANAGEMENT_M2M_ROLE_NAMES`, then point the MCP server at the deployment:

```sh
LOGTO_ENDPOINT=https://auth.example.com
LOGTO_MCP_CLIENT_ID=<app id>
LOGTO_MCP_CLIENT_SECRET=<app secret>
LOGTO_TENANT_ENDPOINT_TEMPLATE=https://{tenantId}.example.com
LOGTO_TENANT_RESOURCE_TEMPLATE=https://{tenantId}.logto.app/api
```

The resource indicator is a fixed identifier (`https://<tenantId>.logto.app/api`), not a URL derived
from the deployment, so the default template is correct as-is.

### 5. Create the tenants and their applications

Through the MCP server, one tenant at a time:

1. `logto_create_tenant` — read the generated tenant ID from the response.
2. `logto_create_application` for each application, using that ID.
3. `logto_create_application_secret` when the application needs a client secret (store the value).
4. `logto_set_tenant_features` for any per-tenant difference.

### 6. Attach the domain

1. Point the project's domain at the deployment (CNAME to the wildcard host).
2. `logto_add_domain` with the hostname, then `logto_verify_domain` with the returned domain ID.

### 7. Repoint the project

Update the project's issuer, client ID and client secret to the tenant's values
(`https://<tenant>.example.com/oidc`, and the credentials from step 5). Sign-in then happens against
the tenant, not the old deployment.

### 8. Verify

- `GET https://<tenant>.example.com/oidc/.well-known/openid-configuration` → issuer is the tenant.
- A real sign-in on the tenant's application.
- The console dropdown lists the new tenant and its feature flags.

### 9. Roll back

Point the project back at its previous deployment and issuer. The tenant keeps its data; delete it
with `logto_delete_tenant` only when the project no longer needs it.

## Known limitations

- **Console in the image.** The console ships prebuilt in the Docker image; when running the core
  from source you need its Vite dev server, and `/console` answers 404/503 without it. The console
  was not browser-verified in the local rehearsal, only its API surface.
- **Users are not exposed through the MCP yet.** Creating and listing users inside a tenant still
  goes through the Management API or the console.
- **Tenant-issued tokens for the tenant's own Management API** are rejected with `invalid_target`
  unless the tenant registers that resource. This is by design: console and MCP access to a tenant's
  Management API is mediated by the admin tenant.
