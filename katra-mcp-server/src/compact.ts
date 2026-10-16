/**
 * Return a token-friendly subset of data. Full payload available via verbose=true.
 */
export function compact(data: unknown, depth = 0): unknown {
  if (depth > 3) return data;
  if (Array.isArray(data)) {
    return data.slice(0, 10).map((item) => compact(item, depth + 1));
  }
  if (data && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .slice(0, 20)
        .map(([k, v]) => [k, compact(v, depth + 1)]),
    );
  }
  if (typeof data === "string" && data.length > 300) {
    return data.slice(0, 300) + "…";
  }
  return data;
}
