// Scratch helper: node supabase/.q.mjs <sql-file> — runs the file's SQL
// against the prod project via the Supabase Management API using
// SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN from .env.local.
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const query = fs.readFileSync(process.argv[2], "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
console.log(await res.text());
