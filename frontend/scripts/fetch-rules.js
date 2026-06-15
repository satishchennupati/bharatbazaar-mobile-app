#!/usr/bin/env node
// Fetch the command-guard ruleset from Unleash and write it to the rules file, so the
// pod refreshes its guard config on every start/wake (called from entrypoint.sh, which
// then runs sync-shims.sh). Best-effort: on ANY failure we write nothing and exit
// non-zero, so cmd-guard.js falls back to its baked-in DEFAULT_RULES.

const https = require("https");
const http = require("http");
const fs = require("fs");
const { URL } = require("url");

const base = process.env.UNLEASH_URL;
const token = process.env.EXPO_CMD_GUARD_UNLEASH_TOKEN;
const flag = process.env.CMD_GUARD_FLAG || "cmd_guard_default";
const outPath = process.env.CMD_GUARD_RULES || "/opt/install-guard/rules.json";

function fail(msg) {
  console.error(`cmd_guard fetch: ${msg}`);
  process.exit(1);
}

if (!base || !token) fail("UNLEASH_URL / EXPO_CMD_GUARD_UNLEASH_TOKEN not set; skipping");

// UNLEASH_URL is the shared base (".../api"); the frontend API lives at "/frontend".
const url = base.replace(/\/+$/, "") + "/frontend";

const lib = url.startsWith("https:") ? https : http;
const req = lib.request(
  url,
  {
    method: "GET",
    headers: { Authorization: token, Accept: "application/json" },
    timeout: 5000,
  },
  (res) => {
    if (res.statusCode !== 200) {
      res.resume();
      return fail(`Unleash returned HTTP ${res.statusCode}`);
    }
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        return fail("response was not valid JSON");
      }
      // Unleash frontend API shape: { toggles: [{ name, enabled, variant: { payload: { type, value } } }] }
      const toggle = (data.toggles || []).find((t) => t.name === flag);
      if (!toggle || !toggle.enabled) return fail(`flag '${flag}' not enabled`);
      const payload = toggle.variant && toggle.variant.payload;
      if (!payload || !payload.value) return fail(`flag '${flag}' has no variant payload`);

      let rules;
      try {
        rules = JSON.parse(payload.value); // payload.value is a JSON string
      } catch (e) {
        return fail("variant payload is not valid JSON");
      }
      // Flat ruleset: { "<pattern>": { allowed: bool, ... }, ... } — same check as rules.js.
      const values = rules && typeof rules === "object" && !Array.isArray(rules) ? Object.values(rules) : [];
      if (values.length === 0 || !values.every((v) => v && typeof v === "object" && typeof v.allowed === "boolean")) {
        return fail("payload is not a flat pattern->{allowed,...} ruleset");
      }

      try {
        fs.writeFileSync(outPath, JSON.stringify(rules));
      } catch (e) {
        return fail(`could not write ${outPath}: ${e.message}`);
      }
      console.error(`cmd_guard fetch: wrote ${outPath} from flag '${flag}'`);
      process.exit(0);
    });
  },
);

req.on("timeout", () => {
  req.destroy();
  fail("request timed out");
});
req.on("error", (e) => fail(`request error: ${e.message}`));
req.end();
