# logto-mcp-server

An MCP (Model Context Protocol) server that exposes the **Logto Management API** — with first-class
support for **multi-tenant (N domains)** deployments — to staff clients like Cursor.

This process is **staff**, not a product client. Cursor authenticates with OAuth against Logto.
Machine-to-machine credentials stay on the server and call the Management API after that login.

Built with the official [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server)
SDK (v2), [`mcp-auth`](https://www.npmjs.com/package/mcp-auth), and Zod.

## Requirements

- Node.js >= 20
- A Logto deployment with multi-tenancy enabled (custom domains and/or `ENDPOINT=https://*.your-domain`)
- A machine-to-machine application that can access the Management API

## Setup

```bash
cd logto-mcp-server
npm install
npm run build
```

Configure it with environment variables (see `.env.example`):

| Variable | Required | Description |
| --- | --- | --- |
| `LOGTO_ENDPOINT` | yes | Base URL that serves the Management API. In multi-tenant setups, the **admin tenant** endpoint (e.g. `https://admin.example.com`). |
| `LOGTO_MCP_CLIENT_ID` | yes | Machine-to-machine app ID. |
| `LOGTO_MCP_CLIENT_SECRET` | yes | Machine-to-machine app secret. |
| `LOGTO_MCP_RESOURCE` | no | Management API resource indicator (M2M audience). OSS default: `https://default.logto.app/api`. |
| `LOGTO_MCP_SCOPE` | no | Space-separated Management API scopes. Defaults to `all`. |
| `LOGTO_TENANT_ENDPOINT_TEMPLATE` | no | Template for a tenant's base URL, with `{tenantId}` as placeholder. Defaults to `https://{tenantId}.logto.app`. |
| `LOGTO_TENANT_RESOURCE_TEMPLATE` | no | Template for a tenant's Management API resource indicator. Defaults to `https://{tenantId}.logto.app/api`. |
| `LOGTO_TENANT_ENDPOINTS` | no | Staff map of tenant id → custom-domain URL (`id=https://auth.lotly.lat,...` or JSON). |
| `MCP_HTTP_PORT` | for Cursor OAuth | When set, serve Streamable HTTP + OAuth instead of stdio. |
| `MCP_PUBLIC_URL` | no | Public MCP URL Cursor calls. Defaults to `http://127.0.0.1:{port}/mcp`. |
| `MCP_OAUTH_RESOURCE` | no | RFC 8707 resource indicator (`aud`). Must match the `url` in Cursor `mcp.json` exactly (no extra slash). Defaults to `MCP_PUBLIC_URL`. |
| `MCP_OAUTH_SCOPES` | no | Scopes advertised and required on user tokens. Defaults to `mcp:all`. |
| `LOGTO_OIDC_ISSUER` | no | Authorization server issuer. Defaults to `{LOGTO_ENDPOINT}/oidc`. Staff Cursor OAuth uses the Tailscale admin tenant (`https://dokploy-vps.tailfadff7.ts.net:8443/oidc`), not the public product host. |
| `LOGTO_MCP_ALLOWED_SUBJECTS` | no | Comma-separated Logto user ids (`sub`) allowed to use HTTP mode. |

M2M client credentials stay on this process. They are **not** put in Cursor `mcp.json`.

## Cursor (HTTP + OAuth)

1. Build, then register the Cursor Native app, MCP API resource, `mcp:all` scope, and Staff MCP role:

```bash
npm run build
npm run register-cursor-client
```

Optional: `LOGTO_MCP_STAFF_USER_ID=<logto-user-id>` assigns the role to that user.

2. Start the HTTP server (same M2M env as above, plus `MCP_HTTP_PORT=3301`).

3. Put **only** the public URL and client id in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "logto-vps": {
      "url": "http://127.0.0.1:3301/mcp",
      "auth": {
        "CLIENT_ID": "<id printed by register-cursor-client>",
        "scopes": ["mcp:all"]
      }
    }
  }
}
```

Cursor opens the browser against Logto. Redirect URIs registered on the Native app:

- `http://localhost:8787/callback`
- `https://www.cursor.com/agents/mcp/oauth/callback`
- `cursor://anysphere.cursor-mcp/oauth/callback`

The staff JWT `aud` is the MCP resource. Tools then call the Management API with the server M2M client.

`logto_whoami` returns the token `sub` so you can confirm the login.

### Stdio (local, no OAuth card)

```json
{
  "mcpServers": {
    "logto": {
      "command": "node",
      "args": ["/absolute/path/to/logto-mcp-server/dist/index.js"],
      "env": {
        "LOGTO_ENDPOINT": "https://admin.example.com",
        "LOGTO_MCP_CLIENT_ID": "<m2m-id>",
        "LOGTO_MCP_CLIENT_SECRET": "<m2m-secret>"
      }
    }
  }
}
```

## Tools

### Control plane (tenants)

| Tool | Read-only | Description |
| --- | --- | --- |
| `logto_list_tenants` | yes | List every tenant with its feature flags and suspension state. |
| `logto_get_tenant` | yes | Get a single tenant by ID. |
| `logto_create_tenant` | no | Create a new isolated tenant. |
| `logto_update_tenant` | no | Update a tenant name and/or tag. |
| `logto_set_tenant_features` | no | Toggle features for a tenant (e.g. disable Organizations for one tenant only). |
| `logto_suspend_tenant` | no | Suspend or resume a tenant. |
| `logto_whoami` | yes | HTTP mode: return the Cursor OAuth `sub` and claims. |

### Tenant resources (applications, domains)

These tools take a `tenant_id` and call that tenant's own Management API, so one machine-to-machine
app can configure every tenant. This is what makes a migration scriptable end to end: create the
tenant, create its applications, attach its domain.

| Tool | Read-only | Description |
| --- | --- | --- |
| `logto_list_applications` | yes | List the applications registered in a tenant. |
| `logto_get_application` | yes | Get one application by ID. |
| `logto_create_application` | no | Create an application (`Native`, `SPA`, `Traditional`, `MachineToMachine`, `Protected`). No client secret is returned. |
| `logto_update_application` | no | Update an application name and/or description. |
| `logto_delete_application` | no (destructive) | Delete an application from a tenant. Requires `confirm: true`. |
| `logto_list_application_secrets` | yes | List the client secrets of an application. |
| `logto_create_application_secret` | no | Create a named client secret. The value is returned only here, so store it immediately. |
| `logto_delete_application_secret` | no (destructive) | Delete a client secret by name. Requires `confirm: true`. |
| `logto_list_domains` | yes | List a tenant's custom domains and their verification status. |
| `logto_add_domain` | no | Register a custom domain for a tenant. The DNS record must already point to this deployment. |
| `logto_verify_domain` | no | Trigger verification for a registered domain. |
| `logto_delete_domain` | no (destructive) | Remove a custom domain from a tenant. Requires `confirm: true`. |

Every data-returning tool accepts `response_format: "json" | "markdown"` (default `markdown`).

### Tenant directory (users, organizations, roles, connectors)

These tools call the same Management API the Admin Console uses. The console stays mounted so a person can open the same record and verify it. Creating a user with a password is the first-admin bootstrap (`logto_create_user`).

| Tool | Read-only | Description |
| --- | --- | --- |
| `logto_list_users` / `logto_get_user` | yes | Search and read users. Password hashes are omitted. |
| `logto_create_user` | no | Create a user, including the first administrator. |
| `logto_update_user` | no | Update name, username, email, or phone. |
| `logto_set_user_password` | no | Replace a password. The new value is not returned. |
| `logto_set_user_suspended` | no | Suspend or resume a user. |
| `logto_delete_user` | no (destructive) | Delete a user. Requires `confirm: true`. |
| `logto_list_organizations` / `logto_get_organization` | yes | Read organizations. |
| `logto_create_organization` / `logto_update_organization` | no | Create or rename an organization. |
| `logto_delete_organization` | no (destructive) | Delete an organization. Requires `confirm: true`. |
| `logto_add_organization_members` | no | Add existing users to an organization. |
| `logto_list_organization_roles` / `logto_create_organization_role` | mixed | Read or create the organization role template. |
| `logto_assign_organization_roles` | no | Assign template roles to a member by name. |
| `logto_list_resources` / `logto_create_resource` | mixed | API resources. The indicator is the token audience. |
| `logto_create_resource_scope` | no | A scope is one piece of data an app may request. |
| `logto_list_roles` / `logto_get_role` / `logto_create_role` | mixed | User and machine-to-machine roles. `scope_ids` attach API scopes. |
| `logto_assign_role_to_users` | no | Assign a User role to people. |
| `logto_assign_role_to_applications` | no | Assign a MachineToMachine role so the app can request those scopes. |
| `logto_list_connectors` / `logto_get_connector` | yes | Markdown hides config values. JSON includes them. |
| `logto_create_connector` / `logto_update_connector` | no | Factory ID plus a config object, for example `smtp`. |
| `logto_delete_connector` | no (destructive) | Requires `confirm: true`. |
| `logto_get_sign_in_experience` | yes | Sign-in methods and branding (logos, colors). |
| `logto_update_sign_in_experience` | no | Patch branding or sign-in settings. Read first; nested objects replace. |
| `logto_list_hooks` / `logto_get_hook` | yes | Webhooks. |
| `logto_create_hook` / `logto_update_hook` | no | Name, events, and delivery URL. |
| `logto_delete_hook` | no (destructive) | Requires `confirm: true`. |

### Examples

> "List all tenants and tell me which ones have Organizations disabled."

> "Create a tenant named `proyecto3` and disable MFA and Enterprise SSO for it."

> "Suspend the tenant `proyecto2`."

## Multi-tenant notes

- Each tenant is fully isolated: its own users, applications, connectors and sign-in experience.
- Tenant management runs against the **control plane** (`/{LOGTO_ENDPOINT}/api/tenants`), which is
  exposed by the admin tenant (and, in OSS, by the default tenant).
- The machine-to-machine app must be granted the Management API `all` scope in the tenant whose
  endpoint you target.
- The tenant resource tools additionally need a token per tenant. On the server, list the app's role
  name in `TENANT_MANAGEMENT_M2M_ROLE_NAMES`: every tenant created through this API then grants that
  machine-to-machine role the `all` scope on its own Management API. Without it, only the control
  plane (tenant) tools work.
- The tenant resource tools reach each tenant at `LOGTO_TENANT_ENDPOINT_TEMPLATE`, unless
  `LOGTO_TENANT_ENDPOINTS` maps that tenant id to a custom domain (staff override).

## Security

- Secrets are read from environment variables only and validated at startup.
- The server never logs to stdout (reserved for the MCP protocol); diagnostics go to stderr.
- Destructive operations (`logto_delete_tenant`) require an explicit `confirm: true` and carry the
  `destructiveHint` annotation so clients can prompt before running them.

## Development

```bash
npm run check       # type-check only
npm run test        # unit tests (config + tenant endpoint map)
npm run build
npm run start:http  # Streamable HTTP; requires MCP_HTTP_PORT
npm run inspector   # MCP Inspector against stdio
```
