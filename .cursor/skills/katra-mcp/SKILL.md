---
name: katra-mcp
description: "Trigger: Logto MCP, Katra, Management API, tenant. Operate the staff MCP and leave the Admin Console for a person to verify."
license: Apache-2.0
metadata:
  author: jics
  version: "1.0"
---

## Activation Contract

Load this skill when a task uses the staff Logto MCP (`logto_*` tools) to read or change Katra tenants, apps, users, or sign-in settings.

## Hard Rules

- Pass `tenant_id` on every tenant-scoped tool. Tenant create, list, features, and suspend use the control-plane tools.
- Ask before any tool that requires `confirm: true`. Pass `confirm: true` only after the person asked to delete.
- Do not repeat passwords, client secrets, or connector config values in the final answer. A client secret is returned once: say that it must be stored in the vault.
- Do not unmount or remove the Admin Console. After a write, name the console screen that shows the same record.
- Use `response_format: "json"` when the next call needs an id. Default markdown hides connector secret values.
- Do not invent feature keys, hook events, or connector config keys. Allowed feature keys and hook events are in `references/catalog.md`.
- Missing feature flags mean enabled. Send only the flags that must change.

## Decision Gates

| Ask | Skill |
|-----|--------|
| App type, API data, scopes, client secret | `katra-mcp-m2m` |
| User, organization, connector, branding, webhook, first admin | `katra-mcp-directory` |
| Tenant create, features, suspend, domain | This skill |

## Execution Steps

1. Call `logto_list_tenants` or `logto_get_tenant` before creating a duplicate.
2. For a new tenant, call `logto_create_tenant`, then the directory or M2M skill. Do not suspend a tenant unless asked.
3. For a custom domain, call `logto_add_domain` only when DNS already points at this deployment, then `logto_verify_domain`.
4. Stop on `LogtoApiError` and report the code. Do not retry a delete.

## Output Contract

Return the tenant id, the record ids you changed, and the Admin Console screen a person should open. Omit secret values.

## References

- `references/catalog.md` — feature keys and hook events.
- `.cursor/skills/katra-mcp-m2m/SKILL.md`
- `.cursor/skills/katra-mcp-directory/SKILL.md`
