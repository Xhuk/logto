---
name: katra-mcp-directory
description: "Trigger: Logto user, organization, connector, sign-in, branding, webhook, first admin. Change tenant directory records via the staff MCP."
license: Apache-2.0
metadata:
  author: jics
  version: "1.1"
---

## Activation Contract

Load this skill when creating or changing users, organizations, connectors, sign-in experience, branding, or webhooks through the staff MCP.

## What changed in 1.1 (2026-10-17)

| Change | What an agent must adapt |
|---|---|
| Sign-in methods are three independent blocks (`signIn.methods[]`, `socialSignInConnectorTargets[]`, `passkeySignIn`) | Enable passkey through `passkeySignIn` only; a `signIn` payload with a `passkey` key does nothing |
| Passkey is **on** in all five tenants | A user without a passkey gets one "create passkey" step after signing in. It is skippable and remembered; `showPasskeyButton: false` also removes the one-screen identifier+password form |

Full history: `CHANGELOG.md` next to this file. Bump `metadata.version` and add a row here plus an entry there in the same commit as any behavior change.

## Hard Rules

- Follow `.cursor/skills/katra/SKILL.md` for the host and vault, and `.cursor/skills/katra-mcp/SKILL.md` for confirm, secrets, and console verification.
- First administrator: `logto_create_user` on the admin tenant with `password` and one of `username`, `primary_email`, or `primary_phone`. The password is not returned. The person signs in on the Experience page.
- Create the user before `logto_add_organization_members`. Assign organization roles only after membership, using role names from `logto_list_organization_roles`.
- `logto_update_sign_in_experience` replaces each nested object you send. Call `logto_get_sign_in_experience` with `response_format: "json"` first and send the full `sign_in` or `sign_up` object.
- Sign-in methods are three independent blocks: `signIn.methods[]` (`{identifier, password, verificationCode, isPasswordPrimary}`), `socialSignInConnectorTargets[]`, and `passkeySignIn {enabled, showPasskeyButton, allowAutofill}`. Passkey **never** goes inside `signIn.methods`; enable it through `passkeySignIn` only. The `passkeySignInEnabled` quota is Cloud-only, so self-hosted Katra accepts it.
- `showPasskeyButton: false` turns the sign-in into an identifier-first flow and removes the one-screen identifier+password form. It does not affect `login_hint` (which no longer prefills anyway); flip it only when the product does not rely on `login_hint_token`.
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
| Passkey (multi-method sign-in) | get sign-in experience → update with `passkeySignIn: {enabled: true, showPasskeyButton: true, allowAutofill: true}` → read back with `verbose` (the passkey block is not in the default response) |
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
