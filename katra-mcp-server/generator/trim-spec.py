import json
base = r"C:\Users\jics\.local\share\katra-mcp"
src = base + r"\spec\katra-management-api.json"
dst = base + r"\spec\katra-admin-api.json"
drop = ("/api/experience", "/api/my-account", "/api/.well-known", "/api/verifications",
        "/api/verification-codes", "/api/user-assets", "/api/authn", "/api/status",
        "/api/swagger.json")
d = json.load(open(src, encoding="utf-8"))
paths = d.get("paths", {})
kept = {k: v for k, v in paths.items() if not any(k == p or k.startswith(p + "/") for p in drop)}
d["paths"] = kept
json.dump(d, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
ops = sum(1 for v in kept.values() for m in v if m in ("get", "post", "put", "patch", "delete"))
print("dropped_paths=%d kept_paths=%d kept_operations=%d" % (len(paths) - len(kept), len(kept), ops))