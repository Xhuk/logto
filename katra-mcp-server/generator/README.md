# generator

One-shot scripts used to produce and patch `../src`. They are kept for reproducibility: when the
Management API changes, re-running them regenerates the same shape of server.

| Script | What it does |
| --- | --- |
| `trim-spec.py` | Fetch `/{tenantId}/api/swagger.json` from the deployment (373 operations) and keep the 279 administration operations. |
| `map-ops.py` | Map each operation to its domain (OpenAPI tag) into `ops-by-domain.txt`. |
| `curate.py` | Select the surface (exclusion list, explicit names, `tier=must`) → `curated-surface.json`. |
| `describe.py` | Write agent-consumer descriptions and parameter hints per domain, one LLM call per domain. |
| `assemble.py` | Rebuild the `ServerDesign` keeping the generator's plumbing, disable telemetry, inject it into the pipeline manifest. |
| `codemod.py` | Replace the emitted `fetch` with `src/client.ts`, add the `tenantId` parameter to tenant-scoped tools, fix zod 4's `z.record` arity. |

## Toolchain

`mcp-anything` 0.2.1 (`uv tool`, on `PATH`), TypeScript target (`--target mcp-use`), driven with a
`brief.yaml` and the trimmed spec:

```sh
mcp-anything build --brief generator/brief.yaml --data-source <trimmed-spec>.json \
  -o out --target mcp-use --auto-approve --resume -v
```

The LLM behind it is DeepSeek's Anthropic-compatible endpoint (`https://api.deepseek.com/anthropic`).
Two traps cost a whole run each:

- **`ANTHROPIC_AUTH_TOKEN` beats `ANTHROPIC_API_KEY`** in the SDK (it is sent as `Bearer`). A stale
  value there makes every phase fall back to the deterministic path with only a quiet
  `LLM call failed (401 …)` line. Clear it before running.
- The generator's reshape step asks for the whole tool set in one response and overflows at ~279
  tools; that is why the surface is curated per domain and injected with `assemble.py` instead.

`kv/io-forger/providers/deepseek` in OpenBao holds the canonical `api_key`, but as of 2026-10-16 that
key is **revoked** (401 `Authentication Fails`); the working key is the one Reasonix uses
(`%APPDATA%\Reasonix\.env`, `DEEPSEEK_API_KEY`). Rotate the OpenBao entry before reusing it.
