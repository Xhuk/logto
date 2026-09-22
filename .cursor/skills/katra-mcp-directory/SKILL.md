---
name: katra-mcp-directory
description: "Trigger: Logto user, organization, connector, sign-in, branding, webhook, first admin. Change tenant directory records via the staff MCP."
license: Apache-2.0
metadata:
  author: jics
  version: "1.0"
---

## Activation Contract

Load this skill when creating or changing users, organizations, connectors, sign-in experience, branding, or webhooks through the staff MCP.

## Hard Rules

- Follow `.cursor/skills/katra/SKILL.md` for the host and vault, and `.cursor/skills/katra-mcp/SKILL.md` for confirm, secrets, and console verification.
- First administrator: `logto_create_user` on the admin tenant with `password` and one of `username`, `primary_email`, or `primary_phone`. The password is not returned. The person signs in on the Experience page.
- Create the user before `logto_add_organization_members`. Assign organization roles only after membership, using role names from `logto_list_organization_roles`.
- `logto_update_sign_in_experience` replaces each nested object you send. Call `logto_get_sign_in_experience` with `response_format: "json"` first and send the full `sign_in` or `sign_up` object.
- Branding logo URLs must be absolute. Color fields are `primaryColor`, `darkPrimaryColor`, and `isDarkModeEnabled`.
- Connector markdown hides config values. Request `json` only when a patch needs the current config. Do not invent config keys.
- Hook `events` must be values from `.cursor/skills/katra-mcp/references/catalog.md`.

## Decision Gates

| Goal | Tool order |
|------|------------|
| First admin or any user | `logto_list_users` → `logto_create_user` |
| Organization member | user exists → `logto_create_organization` or get → `logto_add_organization_members` → `logto_assign_organization_roles` |
| Email or social connector | `logto_list_connector_factories` → `logto_create_connector` using a factory id and config keys from that list |
| Logo, color, sign-in method | get sign-in experience → update |
| Webhook | `logto_create_hook` with `name`, `events`, `url` |

## Execution Steps

1. Search with `logto_list_users` or `logto_list_organizations` before creating.
2. Apply the matching row in Decision Gates. Use `response_format: "json"` when the next call needs an id.
3. Password changes go through `logto_set_user_password`. Do not put the password in the final answer.
4. Suspend with `logto_set_user_suspended`. Delete only with `confirm: true` after an explicit delete request.

## Output Contract

Return tenant id, user or organization or connector or hook id, and the Admin Console screen to open. Omit passwords and connector config values.

## References

- `.cursor/skills/katra/SKILL.md`
- `.cursor/skills/katra-mcp/SKILL.md`
- `.cursor/skills/katra-mcp/references/catalog.md`
