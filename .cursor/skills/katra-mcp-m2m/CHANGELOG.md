# katra-mcp-m2m skill — changelog

Newest first. Each entry says what changed and what an agent has to adapt.

## 1.2 — 2026-10-17

- **New: `login_hint_token`.** A product BFF that already resolved the user on its own screen mints an opaque token with `POST /api/login-hint-tokens` (`{identifier, clientId}`) and redirects with it; Katra then asks only for the password and shows the masked confirmation. Ten minutes, single use, bound to that application, one token per sign-in attempt. → Adapt: pass `clientId` = the SPA/Traditional app that will run the authorize; the browser never calls the mint; a token minted for another application is ignored rather than rejected.
- **Where the mint authenticates.** The staff M2M client (`cursorM2M`) only mints at the admin issuer (`https://katra-imperial.tailfadff7.ts.net:8443/oidc`, resource `https://admin.logto.app/api`); the tenant's own `/<host>/auth/oidc/token` answers `invalid_client` for it. → Adapt: to mint from the product's own host — no Tailscale — provision a machine-to-machine client **inside that tenant** (this skill) and use its credentials with `resource=https://{tenantId}.logto.app/api`.
- **Secrets are no longer readable.** `GET /api/applications/{id}/secrets` answers `value: '<redacted>'`. → Adapt: the value exists only in the creation response; store it in OpenBao in the same turn, and never plan a flow that reads a secret back.

## 1.1 and earlier

Predate this changelog; the git history of `SKILL.md` is the record.
