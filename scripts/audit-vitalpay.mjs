#!/usr/bin/env node
// Read-only inventory: GET requests only, no balance reads or purchases.
// Credentials must be injected securely; never pass keys as CLI arguments.
import { pathToFileURL } from "node:url";

const BILLER_ALIASES = {
  dstv: ["dstv_zw"],
  zol: ["zol_zw"],
  telone: ["telone_zw"],
  bulawayo_city_council: ["bulawayo_city_zw"],
  norton_town: ["norton_council_zw"],
  msu: ["edu_msu_zw"],
  cut: ["edu_cut_zw"],
  hit: ["edu_hit_zw"],
  nust: ["edu_nust_zw"],
  uz: ["edu_uz_zw"],
};

export function buildMappingCandidates(categories, operators, billers) {
  const enabled = new Set(categories.filter((c) => c.enabled === true).map((c) => c.slug));
  const candidates = [];
  if (enabled.has("airtime")) {
    for (const network of ["econet", "netone", "telecel"]) {
      const op = operators.find((o) => [network + "_zw", "zw_" + network].includes(o.operator_id ?? o.id));
      if (!op || (op.country_iso && op.country_iso !== "ZW") || op.currency !== "USD") continue;
      candidates.push({ service_id: "airtime", network_id: network, provider_product_id: op.operator_id ?? op.id, endpoint: "/airtime/purchase" });
    }
  }
  if (enabled.has("bills")) {
    for (const [serviceId, aliases] of Object.entries(BILLER_ALIASES)) {
      const biller = billers.find((b) => aliases.includes(b.biller_code ?? b.id));
      if (!biller || !Array.isArray(biller.currencies) || !biller.currencies.includes("USD")) continue;
      candidates.push({ service_id: serviceId, network_id: "", provider_product_id: biller.biller_code ?? biller.id, provider_sku: biller.type ?? "", endpoint: "/bills/pay" });
    }
  }
  return candidates;
}

async function readCatalog(path, secretKey) {
  const response = await fetch(`https://kmgvitallinks.co.uk/api/v1${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  // Do not print provider error bodies, request headers, or credentials.
  if (!response.ok) throw new Error(`Catalog GET ${path.split("?")[0]} returned HTTP ${response.status}`);
  const json = await response.json();
  if (json.success !== true || !json.data) throw new Error(`Catalog GET ${path.split("?")[0]} did not return a success envelope`);
  return json.data;
}

async function main() {
  const key = process.env.VITALPAY_SECRET_KEY;
  if (!key) throw new Error("VITALPAY_SECRET_KEY is missing. Supply it securely in environment settings.");
  const categories = (await readCatalog("/catalog/categories", key)).categories;
  if (!Array.isArray(categories)) throw new Error("Category response did not include a categories array");
  const enabled = new Set(categories.filter((c) => c.enabled === true).map((c) => c.slug));
  const report = {
    observed_at: new Date().toISOString(),
    mode: "read-only; no mappings or customer routing changed",
    categories: categories.map(({ slug, enabled }) => ({ slug, enabled })),
    catalogs: {},
    candidates: [],
    limitations: [
      "Candidates require review against TopMe services; nothing is enabled automatically.",
      "Category access does not prove provider float, country/product availability, or successful delivery.",
      "ZESA requires Zimbabwe utility confirmation; it has no discovery endpoint in the supplied reference.",
      "Data and branded vouchers require an exact product/bundle match and fulfillment implementation.",
      "Generic school fees and council bills cannot default to an arbitrary institution or council.",
    ],
  };
  let operators = [];
  let billers = [];
  for (const [name, category, path, field] of [
    ["airtime", "airtime", "/airtime/operators?country_iso=ZW", "operators"],
    ["data", "airtime", "/data/operators?country_iso=ZW", "operators"],
    ["bills", "bills", "/bills/billers?country=ZW", "billers"],
    ["gift_cards", "gift_cards", "/gift-cards/products?country=ZW", "products"],
  ]) {
    if (!enabled.has(category)) {
      report.catalogs[name] = { status: "category_not_enabled" };
      continue;
    }
    try {
      const data = await readCatalog(path, key);
      if (!Array.isArray(data[field])) throw new Error(`Catalog ${name} did not include a ${field} array`);
      const rows = data[field];
      // Emit only public catalog fields, never raw API envelopes.
      report.catalogs[name] = { status: "available", count: rows.length, products: rows.map((r) => ({
        id: r.operator_id ?? r.biller_code ?? r.id,
        name: r.name,
        country: r.country_iso ?? r.country,
        currency: r.currency,
        currencies: r.currencies,
        type: r.type,
        supported_types: r.supported_types,
      })) };
      if (name === "airtime") operators = rows;
      if (name === "bills") billers = rows;
    } catch (error) {
      report.catalogs[name] = { status: "unavailable", message: error instanceof Error && error.message.startsWith("Catalog ") ? error.message : "Catalog request could not be completed" };
    }
  }
  report.candidates = buildMappingCandidates(categories, operators, billers);
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report.catalogs).some((c) => c.status === "unavailable")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeMessage = error instanceof Error && /^(Catalog |Category response|VITALPAY_SECRET_KEY)/.test(error.message)
      ? error.message : "VitalPay catalog audit failed; check network access and the secure key binding.";
    console.error(safeMessage);
    process.exitCode = 1;
  });
}
