# Project Instructions

## Staff MCP

When operating Katra, follow `.cursor/skills/katra` first, then `.cursor/skills/katra-mcp`, `.cursor/skills/katra-mcp-m2m`, and `.cursor/skills/katra-mcp-directory`. Leave the Admin Console mounted so a person can verify the same record.

## Pull Requests

When creating PRs:

- If creating a branch, start it with the author's GitHub username (or another stable branch-safe identifier if unavailable), normalized to lowercase kebab-case, followed by lowercase kebab-case words, with no `/`.
- Follow the repository PR template when available instead of duplicating it in instructions.
- Do not describe feature flag details such as `isDevFeaturesEnabled` in the PR description.
- In the `Testing` section, write `Tested locally`, `Unit tests`, `Integration tests`, or `N/A` as appropriate.
- Do not mention build success, typecheck passing, or other CI-style checks in the `Testing` section.

## Changesets

Changesets and `isDevFeaturesEnabled` should not appear together for the same change. If a feature is split across multiple PRs, keep intermediate PRs behind `isDevFeaturesEnabled` without changesets; when releasing it, remove only that feature's guard and add its changeset.

Unless explicitly requested otherwise, prefer `isDevFeaturesEnabled` over a changeset. New features should be protected by `isDevFeaturesEnabled` by default, unless the affected code is already inside an `isDevFeaturesEnabled` guard.

Standalone bug fixes do not need `isDevFeaturesEnabled`, but bug-fix PRs should include a changeset when the fix affects released behavior.

When adding a `.changeset` entry, prefer running `pnpm changeset` from the repository root.

Changeset text should use this format:

- First paragraph: one concise summary sentence.
- The summary must start with a lowercase letter and omit the trailing period.
- Optional following paragraph: detailed description when needed.
- Write changeset text for the user-facing changelog. Describe the final product capability or behavior users can use.
- Do not describe the release mechanics or implementation process, such as releasing a feature, removing a feature flag, or enabling an already-built feature.

## Dev features

When asked to remove `isDevFeaturesEnabled`, treat the request as scoped to one specific feature. Never remove all `isDevFeaturesEnabled` usage globally unless explicitly instructed otherwise.

When adding `isDevFeaturesEnabled` for a new feature, include a comment that identifies the guarded feature at a high level. Prefer naming the broader feature area rather than a narrow implementation detail so the guard can be found and removed together when the feature is released.

Keep public API changes backward-compatible. Do not rename existing fields, remove accepted inputs, or change released error semantics without an explicit product decision.

When adding or changing API behavior, update the corresponding OpenAPI document in the same PR. For an in-development API, use `tags: ["Dev feature"]` to guard an entire operation, or set `x-logto-dev-feature: true` on an individual schema property. These markers keep in-development API surfaces out of public OpenAPI output when dev features are disabled.

## Localization

When changing copy under `packages/phrases`, sync and translate the corresponding entries for the other locale files in the same PR unless the change is intentionally source-locale only.

## Lint and TypeScript Suppressions

Every `eslint-disable` and `@ts-expect-error` must include a short reason explaining why the suppression is safe or necessary.

## Commit Hook Discipline

Never bypass commit hooks.

Many packages in this project depend on each other through built artifacts. When checks fail because local package outputs are stale or missing, run `pnpm prepack` to rebuild them before retrying.

If a hook cannot be fixed safely within the current task, stop and report the blocker with the failed command, relevant output, why it is out of scope, and what decision is needed.

## Memoria y contratos (ritual obligatorio)

Este repo es la **autoridad** del contrato de identidad. Antes de trabajar:

1. **Contratos**: `C:\proyectos\contracts` — los pares `katra/<app>.md` los publica este repo. Cambiar
   endpoints, scopes o redirect URIs = subir `version` en el contrato **antes** de tocar el IdP.
2. **Wiki**: `python C:\proyectos\llm-wiki\tools\wiki.py search <tema>` y `neighbors <pagina>` (grafo, no grep).
3. **Engram**: `mem_context` + `mem_search` (proyecto `logtovulkan` vía `.engram/config.json`).

Al cerrar: gate verde -> `mem_save` -> actualizar paginas de la wiki + linea en `log.md` ->
`python C:\proyectos\llm-wiki\tools\wiki.py lint` (0 problemas).

Operar el IdP es por **MCP** (`katra-mcp-server`, 129 tools, m2m), no editando compose a mano.`n`nLas skills de Katra (`.cursor/skills/katra*`) llevan `version` en el frontmatter y un `CHANGELOG.md` con **qué cambió y qué debe adaptar** el agente. Al cambiar un comportamiento: subir `version`, agregar la fila en `## What changed in <version>` del `SKILL.md` y la entrada del `CHANGELOG.md`, en el mismo commit. Al cargar la skill, leer primero ese bloque: hay contratos retirados (por ejemplo `login_hint` ya no precarga).
Detalle del ritual: `C:\proyectos\llm-wiki\RITUAL.md`.

