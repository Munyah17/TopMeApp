#!/usr/bin/env node
// Bumps package.json's patch version by 0.0.1 and logs the release to the
// app_versions table (shown on /admin/settings/versions and /super-admin/
// settings/versions) — so "currently deployed" and the release history
// actually move on every real deploy instead of sitting static forever
// because nobody remembered to fill in the manual version-log form.
//
// Run this as part of shipping to production — bump/commit before
// `git push` + `vercel --prod`, so the built package.json (which the
// version tracker reads at runtime) reflects the new number.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const [major, minor, patch] = pkg.version.split(".").map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`[release] package.json version: ${nextVersion}`);

function readEnv(file) {
  const env = {};
  fs.readFileSync(path.join(root, file), "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

async function logRelease() {
  const env = readEnv(".env.local");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[release] Supabase credentials not found in .env.local — skipping app_versions log (package.json is still bumped).");
    return;
  }

  let notes = "";
  try {
    notes = execSync("git log -1 --pretty=%s", { cwd: root }).toString().trim();
  } catch {
    // no git history available — leave notes blank rather than fail the release
  }

  const res = await fetch(`${url}/rest/v1/app_versions`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ version: nextVersion, channel: "production", notes, released_by: null }),
  });

  if (!res.ok) {
    console.error(`[release] Failed to log to app_versions: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[release] Logged v${nextVersion} to app_versions${notes ? ` — "${notes}"` : ""}`);
}

logRelease();
