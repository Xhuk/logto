---
name: katra-mcp-m2m
description: "Trigger: M2M, API resource, scope, client secret, Logto application. Provision an app and the data it may request via the staff MCP."
license: Apache-2.0
metadata:
  author: jics
  version: "1.1"
---

## Activation Contract

Load this skill when creating or wiring a Logto application, its API resource, scopes, or client secret through the staff MCP.

## Hard Rules

- Follow `.cursor/skills/katra/SKILL.md` for the host and vault, and `.cursor/skills/katra-mcp/SKILL.md` for confirm, secrets, and console verification.
- Create the application before the secret. `logto_create_application` does not return a secret.
- Scope names have no spaces. The resource `indicator` is the token audience (`aud`).
- Attach scope ids to a role with `type: "MachineToMachine"`. Assign that role with `logto_assign_role_to_applications`.
- Assign `type: "User"` roles only with `logto_assign_role_to_users`.
- `MachineToMachine` has no login page. `SPA` and `Traditional` still send people through the Experience SPA.
- Set `redirect_uris` and `post_logout_redirect_uris` on `logto_create_application` or `logto_update_application`. A list replaces the previous list. Add `cors_allowed_origins` for browser apps.

## Decision Gates

| App type | After create |
|----------|----------------|
| Machine client for an app or an LLM | `logto_provision_machine_client`. Store the secret. Do not echo it |
| `Traditional`, `Protected` | `logto_create_application_secret`, then store the value outside the chat |
| `Native`, `SPA` | No client secret. Pass `redirect_uris` and `post_logout_redirect_uris` on create or update |

## Execution Steps

1. For an app or an LLM that authenticates with client credentials, call `logto_provision_machine_client` once. It reuses a Machine-to-machine app with the same name, creates the secret once, attaches the role, and returns client id, resource, scope, and the token URL for each caller.
2. Store `clientSecret` in OpenBao. Do not repeat it. A later call returns null for that field. Pass `rotate_secret: true` only when the person asked to rotate.
3. Omit `resource_indicator` to use the tenant Management API audience (`https://{tenantId}.logto.app/api`, scope `all`). Pass a custom indicator when the client calls another API.
4. Hand the caller only its row from the packet. The VPS host token URL is for the host network namespace. Do not put it in a `service:tailscale` container, in Vite, or on `katra-imperial`.
5. For a browser app, skip this tool. `logto_list_applications`, then `logto_create_application` with redirect URIs. SPA and Native get no secret.

## Output Contract

Return tenant id, application id, grant `client_credentials`, resource, scope, role id, and which caller token URL applies. State where the secret was stored, not the secret. Name the Admin Console application page.

## References

- `.cursor/skills/katra/SKILL.md`
- `.cursor/skills/katra-mcp/SKILL.md`
- `.cursor/skills/katra-mcp/references/catalog.md`
