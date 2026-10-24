import assert from "node:assert/strict";
import test from "node:test";
import { buildMappingCandidates } from "../scripts/audit-vitalpay.mjs";

const categories = [{ slug: "airtime", enabled: true }, { slug: "bills", enabled: true }];
const operators = [{ operator_id: "econet_zw", country_iso: "ZW", currency: "USD" }];
const billers = [{ id: "dstv_zw", type: "tv", currencies: ["USD"] }, { id: "edu_msu_zw", type: "education_university", currencies: ["USD"] }];

test("catalog matches propose exact endpoints without inventing missing products", () => {
  const candidates = buildMappingCandidates(categories, operators, billers);
  assert.deepEqual(candidates.map((c) => c.service_id), ["airtime", "dstv", "msu"]);
  assert.equal(candidates[0].network_id, "econet");
  assert.equal(candidates[0].endpoint, "/airtime/purchase");
  assert.equal(candidates[1].provider_sku, "tv");
  assert.equal(candidates.some((c) => ["schoolfees", "data", "zesa", "netflix", "telecel"].includes(c.service_id)), false);
});

test("disabled categories never produce routing candidates", () => {
  assert.deepEqual(buildMappingCandidates(categories.map((c) => ({ ...c, enabled: false })), operators, billers), []);
});

test("foreign-country and non-USD products never map into Zimbabwe USD checkout", () => {
  assert.deepEqual(buildMappingCandidates(categories, [{ ...operators[0], country_iso: "ZA" }], billers.map((b) => ({ ...b, currencies: ["ZAR"] }))), []);
  assert.deepEqual(buildMappingCandidates(categories, [{ ...operators[0], currency: "ZAR" }], []), []);
});

test("ambiguous names and missing currency evidence are left for review", () => {
  assert.deepEqual(buildMappingCandidates(categories, [{ name: "Econet", currency: "USD" }], [{ id: "dstv_zw" }, { id: "unknown", name: "School fees", currencies: ["USD"] }]), []);
});
