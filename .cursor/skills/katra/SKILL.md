---
name: katra
description: "Trigger: Katra, set up Katra, configure Katra, katra-imperial, staff MCP. Set up and configure Katra from hosts through tenants, apps, users, and product cutover."
license: Apache-2.0
metadata:
  author: jics
  version: "1.2"
---

## Activation Contract

Load this skill before setting up, configuring, or operating Katra: hosts, staff MCP, tenants, applications, users, sign-in, secrets, or pointing a product at Katra.

## Hard Rules

- Read `references/operating-map.md` before choosing a host, tenant id, vault path, or product env var.
- Writes go through the staff MCP (`logto_*` on `user-logto-vps`). Then follow `.cursor/skills/katra-mcp`, `.cursor/skills/katra-mcp-m2m`, and `.cursor/skills/katra-mcp-directory`.
- Leave the Admin Console mounted. After a write, name the console screen that shows the same record.
- Do not print passwords, client secrets, or connector config. Store a new secret in OpenBao and name the key.
- Do not copy users or passwords from `auth.kairova.services`. Do not call Logto Cloud or `mcp.logto.io`.
- Pick the endpoint from the caller table in `references/operating-map.md`. One URL does not fit every caller. Tailscale `katra-imperial` is the admin console and the IDE MCP path. `http://127.0.0.1:13101/{tenantId}` is only a process in the VPS host network namespace.
- Email as a sign-up identifier requires `verify: true`. Email as a sign-in method does not. `logto_update_sign_in_experience` replaces the nested object you send.

## Decision Gates

| Ask | Action |
|-----|--------|
| Where it runs, current ids, vault, cutover | `references/operating-map.md` |
| Tenant, features, domain, suspend | `katra-mcp` |
| App, redirect URIs, API resource, secret | `katra-mcp-m2m` |
| User, organization, connector, sign-in, webhook | `katra-mcp-directory` |
| Old OSS `auth.kairova.services` | Not Katra. Stop and say which surface the task is on |

## Execution Steps

1. Read `references/operating-map.md`. List tenants before creating one.
2. Reuse an existing tenant or app with the same name and type.
3. Run the matching skill. Pass `tenant_id` on every tenant-scoped tool.
4. Put new secrets in the OpenBao path from the map. Do not write the `dokploy` namespace or Infisical until a cutover was requested.
5. Return ids and the console screen. Omit secret values.

## Output Contract

Return the surface (Katra, not the old OSS), tenant id, record ids changed, vault key names, and the Admin Console screen to open. State whether product env was left unchanged.

## References

- `references/operating-map.md` — hosts, live tenants, vault, cutover rules.
- `.cursor/skills/katra-mcp/SKILL.md`
- `.cursor/skills/katra-mcp-m2m/SKILL.md`
- `.cursor/skills/katra-mcp-directory/SKILL.md`
