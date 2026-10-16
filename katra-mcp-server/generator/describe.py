"""Write agent-consumer descriptions for the curated Katra tools, in per-domain batches.

Why batches: the generator's own reshape tried all 279 tools in one 16k-output call and
truncated. One call per domain keeps every response small and deterministic to parse.
"""
import json
import os
import re
import sys
from collections import defaultdict

import yaml

BASE = r"C:\Users\jics\.local\share\katra-mcp"
MODEL = "claude-sonnet-4-20250514"

SYSTEM = (
    "You write tool descriptions for an MCP server that administers a self-hosted Logto/Katra "
    "identity provider (tenants, applications, users, organizations, roles, connectors, "
    "sign-in experience, configs). The reader is an AI agent that must pick the right tool and "
    "call it correctly.\n"
    "RULES:\n"
    "- Imperative, second-person-free voice describing what the tool does for the operator. "
    "Never start with 'Wraps', 'Calls', 'Invokes', 'Helper for' or 'Get the'.\n"
    "- One to three sentences. State the effect and, when it matters, the side effect "
    "(creates, replaces a whole list, returns a secret only once, is destructive/irreversible).\n"
    "- Name the identifiers the caller must supply (tenant id, application id, user id, role id) "
    "and what the tool returns.\n"
    "- For parameters, give a short practical hint (accepted values, format, defaults) and an "
    "empty string when the parameter is self-explanatory.\n"
    "- Never mention HTTP methods, paths or 'API'.\n"
    "Return ONLY JSON."
)


def client():
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set in this process")
    return anthropic.Anthropic(api_key=key, base_url="https://api.deepseek.com/anthropic")


def text_of(response):
    return next((b.text for b in (response.content or []) if getattr(b, "text", None) is not None), "")


def ask(cli, group, payload):
    prompt = (
        f"Domain group: {group}\n"
        "For every tool below, write `description` and per-parameter hints.\n"
        "Return JSON exactly like:\n"
        '{"tools":[{"name":"<tool name>","description":"<text>",'
        '"params":{"<param name>":"<hint or empty string>"}}]}\n'
        "Every string must stay on ONE line: escape double quotes as \\\" and use no raw newlines.\n"
        "Tools (JSON):\n" + json.dumps(payload, ensure_ascii=False, indent=1)
    )
    messages = [{"role": "user", "content": prompt}]
    last = ""
    for attempt in range(3):
        response = cli.messages.create(
            model=MODEL,
            max_tokens=6000,
            system=SYSTEM,
            messages=messages,
        )
        raw = text_of(response).strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
        start = min((i for i in (raw.find("{"), raw.find("[")) if i >= 0), default=0)
        try:
            return json.loads(raw[start:])
        except json.JSONDecodeError as exc:
            last = str(exc)
            messages = messages[:1] + [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        f"That was not valid JSON ({last}). Return the same content as strictly "
                        "valid JSON: single-line strings, escaped double quotes, no trailing commas."
                    ),
                },
            ]
    raise ValueError(f"invalid JSON after 3 attempts: {last}")


def main() -> None:
    curated = json.load(open(BASE + r"\work\curated-surface.json", encoding="utf-8"))
    seed = yaml.safe_load(open(BASE + r"\out\tool_spec.yaml", encoding="utf-8"))
    seed_by_name = {t["name"]: t for t in seed["tools"]}

    groups = defaultdict(list)
    for item in curated:
        groups[item["group"]].append(item)

    cli = client()
    out = {}
    existing_path = BASE + r"\work\descriptions.json"
    if os.path.exists(existing_path):
        out = json.load(open(existing_path, encoding="utf-8"))
        print(f"existing descriptions kept: {len(out)}")
    failures = []
    for group, items in sorted(groups.items()):
        if all(item["name"] in out for item in items):
            print(f"{group:22s}  (ya descrito, se salta)")
            continue
        payload = []
        for item in items:
            tool = seed_by_name[item["seed_tool"]]
            payload.append({
                "name": item["name"],
                "http_method": item["method"],
                "http_path": item["path"],
                "api_summary": tool.get("description", ""),
                "params": [
                    {
                        "name": p["name"],
                        "in": p.get("location") or "body",
                        "required": bool(p.get("required")),
                        "type": p.get("type"),
                    }
                    for p in tool.get("parameters", [])
                ],
            })
        try:
            data = ask(cli, group, payload)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            failures.append((group, f"{type(exc).__name__}: {exc}"))
            continue
        for entry in data.get("tools", []):
            out[entry["name"]] = {
                "description": (entry.get("description") or "").strip(),
                "params": {k: (v or "").strip() for k, v in (entry.get("params") or {}).items()},
            }
        print(f"{group:22s} {len(data.get('tools', [])):3d} described")

    json.dump(out, open(BASE + r"\work\descriptions.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    missing = [item["name"] for item in curated if item["name"] not in out]
    short = [n for n, v in out.items() if len(v["description"]) < 40]
    bad_voice = [n for n, v in out.items() if re.search(r"\b(Wraps|Calls|Invokes|Helper for)\b", v["description"])]
    print(f"descriptions: {len(out)}/{len(curated)}  missing={len(missing)} short={len(short)} bad_voice={len(bad_voice)}")
    if missing:
        print("missing:", ", ".join(missing[:20]))
    if failures:
        print("group failures:", failures)
        sys.exit(2)


if __name__ == "__main__":
    main()
