"""Assemble the curated tool spec and inject it into the pipeline manifest.

The HTTP plumbing (impl.method/path/arg_mapping and parameter shapes) is copied verbatim from
the seed spec so the emitter keeps producing correct calls; only names, descriptions,
per-parameter hints, module/group metadata and telemetry/discovery flags change.
"""
import copy
import json
import sys
from collections import OrderedDict

import yaml

BASE = r"C:\Users\jics\.local\share\katra-mcp"

GROUP_DESCRIPTIONS = OrderedDict([
    ("tenants", "Tenant lifecycle and control plane: list, create, rename, feature flags, suspend."),
    ("applications", "Applications and their secrets: the clients each product signs in with."),
    ("users", "End-user accounts: create, update, passwords, suspension, roles."),
    ("organizations", "Organizations and membership: the B2B side of a tenant."),
    ("organization-roles", "Organization role templates, organization scopes and invitations."),
    ("roles", "User and machine-to-machine roles and their scope links."),
    ("resources", "API resources and scopes: the audiences and permissions tokens carry."),
    ("connectors", "Connector catalog and configured connectors (social, email, SMS): test them."),
    ("sign-in-experience", "Sign-in methods, branding, custom phrases, profile fields, email templates."),
    ("configs", "Tenant-level console and token configs: admin console flags, ID token claims, JWT customizers."),
    ("domains", "Custom domains: register, inspect, verify, remove."),
    ("hooks", "Webhooks: register, inspect, update, remove."),
    ("enterprise-sso", "Enterprise SSO connectors for SAML/OIDC identity providers."),
    ("operations", "Deployment operations: audit logs, secrets, user counts."),
    ("account-center", "The account center end users see to manage their own profile."),
])

SERVER_DESCRIPTION = (
    "Machine-to-machine administration of a self-hosted, path-based multi-tenant Logto (Katra) "
    "deployment: bootstrap a tenant from scratch, link the product applications that consume it, "
    "issue and store credentials, provision the identity model, and operate sign-in, domains, "
    "connectors and configs. Credentials stay in the environment; secrets are never echoed."
)


def main() -> None:
    seed = yaml.safe_load(open(BASE + r"\out\tool_spec.yaml", encoding="utf-8"))
    curated = json.load(open(BASE + r"\work\curated-surface.json", encoding="utf-8"))
    descriptions = json.load(open(BASE + r"\work\descriptions.json", encoding="utf-8"))
    seed_by_name = {t["name"]: t for t in seed["tools"]}

    tools = []
    modules: dict[str, list[str]] = OrderedDict()
    groups: dict[str, list[str]] = OrderedDict()
    for item in curated:
        source = seed_by_name.get(item["seed_tool"])
        if source is None:
            print("MISSING SEED TOOL", item["seed_tool"], file=sys.stderr)
            sys.exit(1)
        tool = copy.deepcopy(source)
        hints = descriptions[item["name"]]
        tool["name"] = item["name"]
        tool["description"] = hints["description"]
        for parameter in tool.get("parameters", []):
            hint = hints["params"].get(parameter["name"], "")
            if hint:
                parameter["description"] = hint
        tool["module"] = item["group"]
        tool["generation_status"] = "ready"
        tool["generation_notes"] = ""
        tools.append(tool)
        modules.setdefault(item["group"], []).append(item["name"])
        groups.setdefault(item["group"], []).append(item["name"])

    design = {
        "server_name": seed["server_name"],
        "server_description": SERVER_DESCRIPTION,
        "tools": tools,
        "resources": seed.get("resources", []),
        "prompts": seed.get("prompts", []),
        "tool_modules": modules,
        "backend": seed.get("backend"),
        "dependencies": seed.get("dependencies", ["mcp>=2.0"]),
        "python_requires": seed.get("python_requires", ">=3.10"),
        "target_install_hint": seed.get("target_install_hint", ""),
        "transport": "stdio",
        "http_host": seed.get("http_host", "0.0.0.0"),
        "http_port": seed.get("http_port", 8000),
        "enable_telemetry": False,
        "generate_agents_md": True,
        "tool_groups": [
            {
                "name": name,
                "description": GROUP_DESCRIPTIONS.get(name, ""),
                "operations": names,
                "disclosure_level": "default",
            }
            for name, names in groups.items()
        ],
        "composed_tools": [],
        "discovery_endpoint": True,
        "backend_base_url": seed.get("backend_base_url", ""),
    }

    # Validate against the package's own model before injecting.
    sys.path.insert(0, r"C:\Users\jics\AppData\Roaming\uv\tools\mcp-anything\Lib\site-packages")
    from mcp_anything.models.design import ServerDesign  # noqa: PLC0415

    validated = ServerDesign.model_validate(design)

    json.dump(validated.model_dump(mode="json"), open(BASE + r"\work\curated-spec.json", "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)

    manifest_path = BASE + r"\out\mcp-anything-manifest.json"
    with open(manifest_path, encoding="utf-8") as handle:
        manifest = json.load(handle)
    manifest["tool_spec"] = validated.model_dump(mode="json")
    manifest["design"] = validated.model_dump(mode="json")
    for phase in ("tool_design", "emit", "skill_bundle", "validation_harness"):
        while phase in manifest.get("completed_phases", []):
            manifest["completed_phases"].remove(phase)
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)

    print(f"tools={len(tools)} groups={len(groups)} telemetry={design['enable_telemetry']}")
    print("completed_phases now:", manifest["completed_phases"])
    print("biggest groups:", ", ".join(f"{k}={len(v)}" for k, v in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:5]))


if __name__ == "__main__":
    main()
