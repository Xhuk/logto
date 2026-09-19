# logto-mcp-server

An MCP (Model Context Protocol) server that exposes the **Logto Management API** — with first-class
support for **multi-tenant** (N domains) deployments — to MCP clients like Claude Desktop, Cursor or
any agent that speaks MCP.

Built with the official [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server)
SDK (v2) and Zod. Same stack as Logto itself (TypeScript on Node.js).

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
| `LOGTO_MCP_RESOURCE` | no | Management API resource indicator (token audience). Defaults to `https://admin.logto.app/api`. |
| `LOGTO_MCP_SCOPE` | no | Space-separated scopes. Defaults to `all`. |

The server authenticates with the OAuth 2.0 **client credentials** grant against
`{LOGTO_ENDPOINT}/oidc/token` and caches the access token until shortly before it expires.

## Configure your MCP client

### Claude Desktop / Cursor (stdio)

```json
{
  "mcpServers": {
    "logto": {
      "command": "node",
      "args": ["/absolute/path/to/logto-mcp-server/dist/index.js"],
      "env": {
        "LOGTO_ENDPOINT": "https://admin.example.com",
        "LOGTO_MCP_CLIENT_ID": "<client-id>",
        "LOGTO_MCP_CLIENT_SECRET": "<client-secret>"
      }
    }
  }
}
```

## Tools

| Tool | Read-only | Description |
| --- | --- | --- |
| `logto_list_tenants` | yes | List every tenant with its feature flags and suspension state. |
| `logto_get_tenant` | yes | Get a single tenant by ID. |
| `logto_create_tenant` | no | Create a new isolated tenant. |
| `logto_update_tenant` | no | Update a tenant name and/or tag. |
| `logto_set_tenant_features` | no | Toggle features for a tenant (e.g. disable Organizations for one tenant only). |
| `logto_suspend_tenant` | no | Suspend or resume a tenant. |
| `logto_delete_tenant` | no (destructive) | Permanently delete a tenant and all of its data. Requires `confirm: true`. |

Every data-returning tool accepts `response_format: "json" | "markdown"` (default `markdown`).

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

## Security

- Secrets are read from environment variables only and validated at startup.
- The server never logs to stdout (reserved for the MCP protocol); diagnostics go to stderr.
- Destructive operations (`logto_delete_tenant`) require an explicit `confirm: true` and carry the
  `destructiveHint` annotation so clients can prompt before running them.

## Development

```bash
npm run check       # type-check only
npm run dev         # watch build
npm run inspector   # open the MCP Inspector against the built server
```
