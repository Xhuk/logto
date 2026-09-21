---
name: katra-mcp-m2m
description: "Trigger: M2M, API resource, scope, client secret, Logto application. Provision an app and the data it may request via the staff MCP."
license: Apache-2.0
metadata:
  author: jics
  version: "1.0"
---

## Activation Contract

Load this skill when creating or wiring a Logto application, its API resource, scopes, or client secret through the staff MCP.

## Hard Rules

- Follow `.cursor/skills/katra-mcp/SKILL.md` for confirm, secrets, and console verification.
- Create the application before the secret. `logto_create_application` does not return a secret.
- Scope names have no spaces. The resource `indicator` is the token audience (`aud`).
- Attach scope ids to a role with `type: "MachineToMachine"`. Assign that role with `logto_assign_role_to_applications`.
- Assign `type: "User"` roles only with `logto_assign_role_to_users`.
- `MachineToMachine` has no login page. `SPA` and `Traditional` still send people through the Experience SPA.
- Set `redirect_uris` and `post_logout_redirect_uris` on `logto_create_application` or `logto_update_application`. A list replaces the previous list. Add `cors_allowed_origins` for browser apps.

## Decision Gates

| App type | After create |
|----------|----------------|
| `MachineToMachine`, `Traditional`, `Protected` | `logto_create_application_secret`, then store the value outside the chat |
| `Native`, `SPA` | No client secret. Pass `redirect_uris` and `post_logout_redirect_uris` on create or update |

## Execution Steps

1. `logto_list_applications` for `tenant_id`. Reuse an app with the same name and type.
2. `logto_create_application` with `name`, `type`, and the redirect URIs that app uses.
3. When the app must call an API: `logto_create_resource` with `name` and `indicator`, then `logto_create_resource_scope` once per datum. Keep each returned scope id.
4. `logto_create_role` with `type: "MachineToMachine"` and `scope_ids`. Then `logto_assign_role_to_applications` with that role id and the application id.
5. For secret-bearing types, `logto_create_application_secret`. Do not call it twice to "check" the value. `logto_list_application_secrets` does not return the secret value.

## Output Contract

Return tenant id, application id, type, resource indicator, scope names, and role id. State where the secret was stored, not the secret. Name the Admin Console application page for a person to verify.

## References

- `.cursor/skills/katra-mcp/SKILL.md`
- `.cursor/skills/katra-mcp/references/catalog.md`
