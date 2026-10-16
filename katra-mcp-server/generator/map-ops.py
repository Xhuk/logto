import yaml, json, collections
base = r"C:\Users\jics\.local\share\katra-mcp"
spec = json.load(open(base + r"\spec\katra-admin-api.json", encoding="utf-8"))
seed = yaml.safe_load(open(base + r"\out\tool_spec.yaml", encoding="utf-8"))

def tag_of(path, method):
    item = spec["paths"].get(path, {}).get(method.lower(), {})
    tags = item.get("tags") or ["(none)"]
    return tags[0]

rows = []
for t in seed["tools"]:
    impl = t["impl"]
    m, p = impl.get("http_method"), impl.get("http_path")
    rows.append((tag_of(p, m), m, p, t["name"], len(t.get("parameters", [])), t["description"]))
rows.sort()
with open(base + r"\work\ops-by-domain.txt", "w", encoding="utf-8") as fh:
    fh.write("DOMAIN\tMETHOD\tPATH\tseed_tool\tparams\tdescription\n")
    for r in rows:
        fh.write("\t".join(str(x) for x in r) + "\n")
c = collections.Counter(r[0] for r in rows)
print("dominios:", len(c), " ops:", len(rows))
for k, v in c.most_common():
    print("%3d  %s" % (v, k))