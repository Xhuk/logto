/**
 * stdio -> Streamable HTTP bridge for the Katra administration MCP.
 *
 * MCP clients that spawn a command (Cursor, Codex, Reasonix) speak stdio; `mcp-use` serves the
 * generated server over Streamable HTTP. This bridge closes that gap and starts the server on
 * demand, so an agent can register it with a `command` entry and no always-on service:
 *
 *   1. reads the deployment's `KATRA_LOGTO_*` credentials from `katra-mcp-server/.env` (gitignored)
 *      or the process environment — secrets never reach the client configuration;
 *   2. if nothing answers on the port, spawns `mcp-use dev` detached (it stays up between agent
 *      sessions) and waits for it;
 *   3. forwards every stdin JSON-RPC message to the HTTP endpoint and writes the responses back.
 *
 * Diagnostics go to stderr; stdout carries only MCP messages.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const loadEnvFile = (): Record<string, string> => {
  const merged: Record<string, string> = { ...process.env } as Record<string, string>;
  const file = resolve(root, ".env");
  if (!existsSync(file)) return merged;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const [, key, rawValue] = match;
    if (!merged[key]) merged[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
  return merged;
};

const env = loadEnvFile();
const port = Number(env["KATRA_MCP_PORT"] ?? 3312);
const endpoint = `http://127.0.0.1:${port}/mcp`;
const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const log = (...parts: unknown[]) => console.error("[katra-mcp-bridge]", ...parts);

const initializeMessage = JSON.stringify({
  jsonrpc: "2.0",
  id: "bridge-probe",
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "katra-mcp-bridge", version: "1.0" },
  },
});

const isUp = async (): Promise<boolean> => {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: initializeMessage,
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const ensureServer = async (): Promise<void> => {
  if (await isUp()) return;
  log(`no server on ${endpoint}; starting one (detached, keeps running between sessions)`);

  // Spawn the CLI through node directly: a `.cmd` shim needs a shell on Windows (spawn EINVAL),
  // and node_modules/.bin/mcp-use is a .cmd there.
  const cli = resolve(root, "node_modules", "mcp-use", "dist", "bin.js");
  if (!existsSync(cli)) {
    throw new Error(`mcp-use is not installed at ${cli}; run npm ci in ${root}`);
  }

  const child = spawn(
    process.execPath,
    [cli, "dev", "--no-inspector", "--no-open", "-p", String(port)],
    { cwd: root, env, detached: true, stdio: "ignore" }
  );
  child.unref();
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(1000);
    if (await isUp()) {
      log(`server ready on port ${port}`);
      return;
    }
  }
  throw new Error(`the MCP server did not come up on port ${port}`);
};

const extractPayloads = (body: string): string[] => {
  const fromEvents = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (fromEvents.length > 0) return fromEvents;
  const single = body.trim();
  return single.startsWith("{") ? [single] : [];
};

const forward = async (line: string): Promise<void> => {
  let id: unknown;
  try {
    id = (JSON.parse(line) as { id?: unknown }).id;
  } catch {
    log("ignoring a non-JSON line from the client");
    return;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: line,
      signal: AbortSignal.timeout(600_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    for (const payload of extractPayloads(body)) process.stdout.write(`${payload}\n`);
  } catch (error) {
    log("request failed:", error instanceof Error ? error.message : String(error));
    if (id !== undefined && id !== null) {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
        })}\n`
      );
    }
  }
};

const main = async (): Promise<void> => {
  await ensureServer();

  // Messages are handled one at a time so responses keep the client's order.
  let queue: Promise<void> = Promise.resolve();
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    queue = queue.then(() => forward(trimmed));
  });
  await new Promise<void>((done) => reader.on("close", () => done()));
  await queue;
};

main().catch((error: unknown) => {
  log("fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
