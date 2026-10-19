# Katra skill — changelog

One entry per version, newest first. Each entry says **what changed** and **what an agent has to adapt**, because an agent that learned the previous version will otherwise act on a contract that no longer exists.

The same rule that produces this file applies to every Katra skill: bump `metadata.version` in `SKILL.md`, add a `## What changed in <version>` block there, and add the entry here — in the same commit as the change itself.

## 1.7 — 2026-10-17

Deployed to `katra-idp` (HEAD `75f90d306`, `compose.deploy`). Repo commits: `9f1dc458b`, `7c66a38f7`, `e7013a4a7`, `3102368bd`, `c149ffdf0`, `517b215ea`, `f609e0308`, `19a0f2688`, `c7171b955`, `b2b6c04be`, `48a273fbd`, `75f90d306`.

**Multi-method sign-in made explicit.** The three blocks are independent: `signIn.methods[]` (`{identifier, password, verificationCode, isPasswordPrimary}`), `socialSignInConnectorTargets[]`, and `passkeySignIn {enabled, showPasskeyButton, allowAutofill}`.
→ Adapt: passkey is **never** inside `signIn.methods`; a payload with `{"password":{…},"passkey":{…}}` enables nothing (the old example in the MCP tool spec came from another version, and it is corrected now).

**Passkey enabled on all five tenants** (`3ni0yi`, `g6qx2x`, `94zk5v`, `5lkfax`, `2thyo9`) with `showPasskeyButton: true` and `allowAutofill: true`.
→ Adapt: a user without a passkey gets **one** "create passkey" step after a password sign-in (`422 user.passkey_preferred` until they bind or skip it; the skip is persisted on the user, so it does not return). `showPasskeyButton: false` turns the flow identifier-first and removes the one-screen identifier+password form. The `passkeySignInEnabled` quota is Cloud-only, so self-hosted Katra accepts the change.

**`login_hint_token`: new, and live.** `POST /api/login-hint-tokens` (Management API, machine-to-machine) takes `{identifier, clientId}` and returns `lh_…`, valid 10 minutes, bound to that application, consumed by the first **successful** password verification. The authorize carries it as `login_hint_token`; Katra asks only for the password and renders the masked confirmation from `GET /api/experience/login-hint` (`X****k`). One token per sign-in attempt (it is not cacheable), stored in `oidc_model_instances` under the `LoginHint` model, gated by `LOGIN_HINT_TOKEN_ENABLED` (default `1` in `docker-compose.katra.vps.yml`; it does **not** open the rest of the dev features).
→ Adapt: the mint is M2M only — the browser never calls it, and the staff M2M client works at the **admin** issuer (`https://katra-imperial.tailfadff7.ts.net:8443/oidc`, resource `https://admin.logto.app/api`); the tenant's own `/auth/oidc/token` rejects it (`invalid_client`). A token minted for another `clientId` is ignored, not rejected. A forged token answers 404 and the SPA falls back to the normal form.

**`login_hint` no longer prefills.** Katra stopped forwarding it to the experience app (`48a273fbd`) and the app ignores it even when injected straight into the SPA URL. It still travels next to a `one_time_token`, where the link itself is the proof.
→ Adapt: do not build a one-screen sign-in on `login_hint` — it renders an empty identifier field. Reason it changed: `login_hint` is a plain query parameter, so anyone who could send a link chose the identifier rendered on the real sign-in screen (with `first_screen=identifier:sign_in` and a password-only experience, literally a password box with a name already in it). **Lotly** (`web/src/components/TenantGate.tsx`, `startKatraSignIn`) still sends `login_hint` with email or username, so its users get the empty field until its dev moves to the mint.

**`GET /api/applications/:id/secrets` masks the value** with `<redacted>` (`f609e0308`); the admin MCP client redacts it too, as a second layer.
→ Adapt: a stored secret cannot be read back any more; only the creation response reveals it. Store it in OpenBao in the same turn. This closes the leak that put real client secrets in agent transcripts twice.

**The admin MCP survives a `204`** (`19a0f2688`): `apiFetch` reads the body once and answers `{ok, status}`.
→ Adapt: a delete no longer reports `Unexpected end of JSON input`. A tool that answers that old message has already deleted; list instead of retrying.

**KSH signs in on Katra** — verified live: `https://ksh.networkvoid.xyz/auth/oidc` advertises `issuer: https://ksh.networkvoid.xyz/auth/oidc`.
→ Adapt: the previous rules said "KSH is not on Katra yet" and "KSH on the old OSS". Both were wrong. `auth.kairova.services` answering with issuer `https://auth.kairova.services/oidc` is the old OSS kept for Dokploy and Infisical; it is not KSH.

## 1.6 and earlier

These versions predate this changelog. The record for them is the git history of the skill:

```bash
git log --oneline -- .cursor/skills/katra
```

Highlights that later entries assume: per-tenant branding with `GET /auth/brand/logo` (`d4c90424d`), `hideLogtoBranding` unsupported in this build (hide `.logto_signature` with `customCss`), the `login_hint` + `identifier` one-screen contract (now retired in 1.7), and the VetGroom demo-first cutover with one host and issuer per product.
