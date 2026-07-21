/**
 * cloud-smoke-assert.mjs — assert that the local extension loaded in the Pi host.
 *
 * Reads Pi RPC JSONL from stdin (the output of a `pi --mode rpc ... -e dist/index.js`
 * run that was sent a `get_commands` command) and verifies that the actual Pi host
 * loaded and activated `dist/index.js`:
 *   1. the extension registered at least one command (source === "extension");
 *   2. that command's source path resolves to the built dist/index.js;
 *   3. (best effort) the extension registered its `agents` widget / `subagents` status
 *      via startup UI requests.
 *
 * Exits 0 on success (printing a summary), 1 on failure.
 */
import process from "node:process";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  raw += c;
});
process.stdin.on("end", () => {
  const records = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t));
    } catch {
      // Non-JSON lines (stray logs) are ignored.
    }
  }

  const extensionCommands = [];
  const uiRequests = [];
  for (const r of records) {
    if (r && r.type === "response" && r.command === "get_commands" && r.data && Array.isArray(r.data.commands)) {
      for (const c of r.data.commands) {
        if (c && c.source === "extension") extensionCommands.push(c);
      }
    }
    if (r && r.type === "extension_ui_request") {
      uiRequests.push(r);
    }
  }

  // Require the command's source path to be exactly dist/index.js — no generic
  // `index.js` fallback, which would let any unrelated loaded extension whose
  // source happens to end in index.js satisfy the provenance check.
  const loadedFromDist = extensionCommands.filter((c) => {
    const p = c.sourceInfo?.path || c.path || "";
    return /(^|\/)dist\/index\.js$/.test(p);
  });

  const widgets = uiRequests.filter((r) => r.method === "setWidget").map((r) => r.widgetKey);
  const statuses = uiRequests.filter((r) => r.method === "setStatus").map((r) => r.statusKey);

  console.log("Pi-host extension smoke:");
  console.log(`  records parsed        : ${records.length}`);
  console.log(`  extension commands    : ${extensionCommands.map((c) => c.name).join(", ") || "(none)"}`);
  console.log(`  loaded from dist      : ${loadedFromDist.length}`);
  console.log(`  startup widgets       : ${widgets.join(", ") || "(none)"}`);
  console.log(`  startup statuses      : ${statuses.join(", ") || "(none)"}`);

  const ok = loadedFromDist.length > 0;
  if (!ok) {
    console.error("FAIL: no extension command was registered from dist/index.js by the Pi host.");
    process.exit(1);
  }
  console.log("PASS: Pi host loaded and registered the local extension.");
  process.exit(0);
});
