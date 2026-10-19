# katra-mcp-directory skill — changelog

Newest first. Each entry says what changed and what an agent has to adapt.

## 1.1 — 2026-10-17

The sign-in experience has three independent blocks, and passkey is enabled in every tenant.

- `signIn.methods[]` keeps only `{identifier, password, verificationCode, isPasswordPrimary}`; passkey lives in `passkeySignIn {enabled, showPasskeyButton, allowAutofill}`. → Adapt: a `signIn` payload carrying a `passkey` key enables nothing (that example came from another build of the MCP tool spec).
- Passkey is on in `3ni0yi`, `g6qx2x`, `94zk5v`, `5lkfax` and `2thyo9`. → Adapt: expect one skippable "create passkey" step after a password sign-in for users without a passkey, and do not flip `showPasskeyButton` without checking the product's sign-in flow.
- The `passkeySignInEnabled` quota is Cloud-only (`QuotaLibrary` returns early when `!isCloud`). → Adapt: on self-hosted Katra the update is accepted; a 403 there means something else.

## 1.0 and earlier

Predate this changelog; the git history of `SKILL.md` is the record.
