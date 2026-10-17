---
name: katra
description: "Trigger: Katra, set up Katra, configure Katra, katra-imperial, staff MCP, admin MCP, katra-mcp-server. Set up and configure Katra from hosts through tenants, apps, users, and product cutover."
license: Apache-2.0
metadata:
  author: jics
  version: "1.6"
---

## Activation Contract

Load this skill before setting up, configuring, or operating Katra: hosts, staff MCP, the complete administration MCP, tenants, applications, users, sign-in, secrets, or pointing a product at Katra.

Two MCP surfaces exist and they are not interchangeable: the **staff MCP** (`logto_*`, deployed on the VPS behind Cursor OAuth, carries the person's identity) and the **administration MCP** (`katra_*` in `katra-mcp-server/`, 129 tools, runs locally with machine-to-machine credentials from the environment). Read `references/admin-mcp.md` before using the second one.

## Hard Rules

- Read `references/operating-map.md` before choosing a host, tenant id, vault path, or product env var; read `references/admin-mcp.md` before using the `katra_*` tools.
- Writes go through the staff MCP (`logto_*` on `user-Katra-Mcp`). Then follow `.cursor/skills/katra-mcp`, `.cursor/skills/katra-mcp-m2m`, and `.cursor/skills/katra-mcp-directory`.
- Use the administration MCP (`katra_*`) only for scripted bootstraps, bulk work, or a tool the staff server does not have. A person driving the Console is the better path for support actions (MFA, sessions, personal access tokens, identity linking).
- The administration MCP has no identity of its own and no authentication on its HTTP listener: keep it on loopback (or the tailnet), never on a public route, and keep its credentials in `katra-mcp-server/.env`, never in a client config, a commit, or the chat. Its first call in a session waits a few seconds while the server boots.
- Leave the Admin Console mounted. After a write, name the console screen that shows the same record.
- Do not print passwords, client secrets, or connector config. Store a new secret in OpenBao and name the key.
- Do not copy users or passwords from `auth.kairova.services`. Do not call Logto Cloud or `mcp.logto.io`.
- Pick the endpoint from the caller table in `references/operating-map.md`. One URL does not fit every caller. Tailscale `katra-imperial` is only the admin console screen; clients never open it. The staff MCP uses the public DNS `https://auth.kairova.services`. A product signs in on its own host `/auth`. `http://127.0.0.1:13101/{tenantId}` is only a process in the VPS host network namespace.
- Email as a sign-up identifier requires `verify: true`. Email as a sign-in method does not. `logto_update_sign_in_experience` replaces the nested object you send.
- The sign-in screen is branded **per tenant**: a product must never render the IdP's brand. `https://logto.io/logo.svg` is the default value and the cause of every "the login still looks like Logto" report. Use the product's own asset, or the brand endpoint `GET /auth/brand/logo` (product `<host>/brand/logo.png`, fallback to the Katra SVG; commit `d4c90424d`). The "Powered by Logto" footer cannot be hidden with `hideLogtoBranding` in this build (400) — hide `.logto_signature` with `customCss`. Detail and current values: `references/operating-map.md` → "Sign-in screen branding".
- `login_hint` (+ `identifier`) is the contract for "the product already knows who is signing in": Katra then asks only the password. Without the hint `/auth/sign-in` asks username and password in one step. Do not "fix" that difference; it is the parameter.

## Decision Gates

| Ask | Action |
|-----|--------|
| Where it runs, current ids, vault, cutover | `references/operating-map.md` |
| Hand someone a tenant's app id, redirects, user, or machine client | `references/operating-map.md` section "Read with the MCP". Do not copy the Live records table when the MCP answers |
| Tenant, features, domain, suspend | `katra-mcp` |
| App, redirect URIs, API resource, secret | `katra-mcp-m2m` |
| User, organization, connector, sign-in, webhook | `katra-mcp-directory` |
| Staff MCP | Public DNS `https://auth.kairova.services`. Not Tailscale. Not a product `/auth` |
| Complete administration surface (129 tools `katra_*`) | `references/admin-mcp.md`. Machine-to-machine credentials from its environment, no identity of its own, runs locally: use the staff MCP while a person is driving, this one for scripted work or a missing tool |
| Admin screen | Tailscale `katra-imperial` only. Staff administers and verifies there. Clients never see it |
| Product login | That product's host `/auth` (`lotly.lat`, `propflow.kairova.services`, `app.vetgroom.com.mx`). KSH is **not** on Katra yet: it still signs in on `auth.kairova.services` |
| "The login looks like Logto" / wrong logo / "Powered by Logto" | `references/operating-map.md` → "Sign-in screen branding". It is branding, not a wrong IdP: check the issuer in discovery before touching anything |
| Which product is on which IdP | Live records table in `references/operating-map.md`. Propflow, Lotly and VetGroom on Katra; KSH on the old OSS; VetGroom prod/demo/offers have no IdP wired |
| `auth.kairova.services` still answering the old OSS | Staff MCP is only `/mcp` (and `/.well-known/oauth-protected-resource`) on that host. Do not repoint Dokploy, Infisical, or a product issuer as a side effect |

## Execution Steps

1. Read `references/operating-map.md`. For a product config, call the tools in "Read with the MCP" and use `response_format: "json"`. List tenants before creating one.
2. Reuse an existing tenant or app with the same name and type.
3. Run the matching skill. Pass `tenant_id` on every tenant-scoped tool.
4. For a scripted bootstrap, bulk change, or a tool the staff MCP lacks, follow `references/admin-mcp.md` and use the `katra_*` tools (pass `tenantId`; control-plane tools address the admin host).
5. Put new secrets in the OpenBao path from the map. Do not write the `dokploy` namespace or Infisical until a cutover was requested.
6. Return ids and the console screen. Omit secret values.

## Output Contract

Return the surface (Katra, not the old OSS), tenant id, record ids changed, vault key names, and the Admin Console screen to open. State whether product env was left unchanged.

## References

- `references/operating-map.md` — hosts, live tenants, vault, cutover rules.
- `references/admin-mcp.md` — the 129-tool administration MCP (`katra-mcp-server/`): when to use it, wiring, environment contract, full tool inventory, rules, recipes and regeneration.
- `.cursor/skills/katra-mcp/SKILL.md`
- `.cursor/skills/katra-mcp-m2m/SKILL.md`
- `.cursor/skills/katra-mcp-directory/SKILL.md`
