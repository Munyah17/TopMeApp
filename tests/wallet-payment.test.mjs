import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Exercise the real Server Action without contacting a database, debiting a
// live wallet, or fulfilling airtime. Only its external dependencies are mocked.
function loadSource(relativePath, dependencies = {}) {
  const filename = resolve(relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiledModule = { exports: {} };
  const require = (name) => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
    return dependencies[name];
  };
  runInThisContext(`(function(exports, require, module, __filename, __dirname) {${outputText}\n})`, { filename })(
    compiledModule.exports, require, compiledModule, filename, dirname(filename),
  );
  return compiledModule.exports;
}

const { PaymentError } = loadSource("src/lib/payments/payment-error.ts");
const { normalizeZimbabweMobile } = loadSource("src/lib/phone-numbers.ts");
const input = { serviceId: "airtime", serviceName: "Airtime", amount: 2, recipient: "0770000000", networkId: "econet" };

function fixture(options = {}) {
  const calls = { debits: 0, deliveries: 0, refunds: 0, errors: [] };
  const tx = { id: "transaction", reference: "TPM-test", amount: 2, fee: 0.04, fulfillment_status: "pending", created_at: "2026-10-24T00:00:00Z" };
  const session = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: "customer" } } }) },
    rpc: async (name, args) => {
      assert.equal(name, "wallet_pay");
      calls.debits++;
      calls.recipient = args.p_recipient;
      return { data: options.debitError ? null : tx, error: options.debitError ?? null };
    },
  };
  const admin = {
    from: (table) => {
      const response = { data: table === "services" ? { id: "airtime", amount_mode: "chips" } : [], error: null };
      const query = {
        select: () => query, eq: () => query,
        single: async () => response,
        then: (resolve) => Promise.resolve(response).then(resolve),
      };
      return query;
    },
    rpc: async (name) => {
      assert.equal(name, "set_fulfillment_result");
      if (options.persistFailure) throw new Error("private database connection detail");
      return { data: { ...tx, fulfillment_status: options.deliveryStatus ?? "pending" } };
    },
  };
  const provider = {
    name: "vitalpay",
    fulfil: async (request) => {
      calls.deliveries++;
      assert.equal(request.recipient, "+263770000000");
      if (options.providerThrows) throw new Error("private provider rejection");
      return { status: options.deliveryStatus ?? "pending" };
    },
  };
  const dependencies = {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createClient: async () => session, createAdminClient: () => admin },
    "@/lib/fulfillment": { hasRealCoverage: () => !options.noCoverage },
    "@/lib/fulfillment/select": {
      hasMappedProvider: async () => false,
      selectFulfillmentProvider: async () => ({ provider, reason: "test provider" }),
    },
    "@/lib/fulfillment/vitalpay": {
      checkAirtimeAmount: () => options.amountError ? { ok: false, message: "This network only sells set amounts." } : { ok: true },
    },
    "@/lib/data/queries": { getAirtimeOperatorRules: async () => ({ econet: {} }) },
    "@/lib/data/flags": {},
    "@/lib/email/client": {},
    "@/lib/email/transaction-alerts": { alertTransaction: async () => {} },
    "@/lib/email/templates": {},
    "@/lib/transaction-events": { logTransactionEvent: async () => {} },
    "@/lib/pricing": {
      resolveVerifiedAmount: async () => {
        if (options.pricingError) throw options.pricingError;
        if (options.invalidAmount) throw new Error("invalid_amount");
        return input.amount;
      },
    },
    "@/lib/push/send": {},
    "@/lib/debug-errors": { logDebugError: async (error, context) => { calls.errors.push({ error, context }); } },
    "@/lib/payments/payment-error": { PaymentError },
    "@/lib/phone-numbers": { normalizeZimbabweMobile },
    "@/lib/payments/refunds": {
      recordFailedFulfilmentRefund: async () => { calls.refunds++; return options.refund ?? null; },
    },
  };
  return { ...loadSource("src/lib/actions/payments.ts", dependencies), calls };
}

for (const [name, options, message] of [
  ["expired login", { noUser: true }, /log in again/],
  ["inactive provider", { noCoverage: true }, /Coming soon/],
  ["invalid amount", { invalidAmount: true }, /Enter a valid amount/],
  ["unsupported denomination", { amountError: true }, /only sells set amounts/],
]) {
  test(`${name} is returned as customer-safe data before any debit`, async () => {
    const f = fixture(options);
    const result = await f.payServiceResult(input);
    assert.equal(result.ok, false);
    assert.match(result.error, message);
    assert.equal(f.calls.debits, 0);
    assert.equal(f.calls.deliveries, 0);
  });
}

test("insufficient funds preserves the useful message and real RPC diagnostics", async () => {
  const f = fixture({ debitError: { message: "insufficient_funds private detail", code: "P0001", details: "internal", hint: "internal" } });
  const result = await f.payServiceResult(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /wallet balance is too low/);
  assert.doesNotMatch(result.error, /private|internal/);
  assert.equal(f.calls.deliveries, 0);
  assert.equal(f.calls.errors[0].error.message, "insufficient_funds private detail");
  assert.equal(f.calls.errors[0].context.metadata.code, "P0001");
  assert.equal("input" in f.calls.errors[0].context.metadata, false);
});

for (const [name, refund, message] of [
  ["completed refund", { status: "paid", amount: 2.04 }, /\$2\.04 has been refunded/],
  ["queued refund", { status: "pending", amount: 2.04 }, /refund is being processed/],
  ["unconfirmed refund", null, /could not confirm your refund/],
]) {
  test(`delivery failure reports ${name} without exposing the provider exception`, async () => {
    const f = fixture({ providerThrows: true, refund });
    const result = await f.payServiceResult(input);
    assert.equal(result.ok, false);
    assert.match(result.error, message);
    assert.doesNotMatch(result.error, /private provider/);
    assert.equal(f.calls.debits, 1);
    assert.equal(f.calls.deliveries, 1);
    assert.equal(f.calls.refunds, 1);
  });
}

test("unexpected post-debit failure stays private and warns against retrying blindly", async () => {
  const f = fixture({ persistFailure: true });
  const result = await f.payServiceResult(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /Check your wallet and transaction history before trying again/);
  assert.doesNotMatch(result.error, /private database/);
  assert.equal(f.calls.errors[0].error.message, "private database connection detail");
  assert.equal(f.calls.debits, 1);
});

test("an unexpected pre-debit exception never exposes its message or stack", async () => {
  const f = fixture({ pricingError: new Error("private upstream credential sbp_example_secret") });
  const result = await f.payServiceResult(input);
  assert.equal(result.ok, false);
  assert.match(result.error, /Check your wallet and transaction history/);
  assert.doesNotMatch(JSON.stringify(result), /private|credential|sbp_|stack/);
  assert.equal(f.calls.debits, 0);
});

test("diagnostics fall back to private server logs when the debug table is missing", async (t) => {
  const entries = [];
  t.mock.method(console, "error", (...args) => entries.push(args));
  const { logDebugError } = loadSource("src/lib/debug-errors.ts", {
    "@/lib/supabase/server": {
      createAdminClient: () => ({
        from: () => ({ insert: async () => ({ error: { code: "PGRST205" } }) }),
      }),
    },
  });
  const error = new Error("private wallet RPC failure");
  const result = await logDebugError(error, { serviceId: "airtime" });
  assert.equal(result, undefined);
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1], error);
  assert.equal(entries[0][2].loggingErrorCode, "PGRST205");
});

for (const deliveryStatus of ["pending", "fulfilled"]) {
  test(`${deliveryStatus} delivery returns the transaction after exactly one debit`, async () => {
    const f = fixture({ deliveryStatus });
    const result = await f.payServiceResult(input);
    assert.equal(result.ok, true);
    assert.equal(result.transaction.fulfillment_status, deliveryStatus);
    assert.equal(result.transaction.reference, "TPM-test");
    assert.equal(f.calls.debits, 1);
    assert.equal(f.calls.recipient, "+263770000000");
    assert.equal(f.calls.deliveries, 1);
    assert.equal(f.calls.refunds, 0);
  });
}

test("invalid airtime numbers are rejected before a wallet debit", async () => {
  const f = fixture();
  const result = await f.payServiceResult({ ...input, recipient: "123" });
  assert.equal(result.ok, false);
  assert.match(result.error, /valid Zimbabwe mobile number/);
  assert.equal(f.calls.debits, 0);
  assert.equal(f.calls.deliveries, 0);
});

test("local and international Zimbabwe mobile formats normalize consistently", () => {
  for (const number of ["077 123 4567", "+263771234567", "263771234567", "00263771234567", "(077) 123-4567"]) {
    assert.equal(normalizeZimbabweMobile(number), "+263771234567");
  }
  for (const number of ["", "123", "077123456789", "+27771234567", "077abc4567", "+263471234567"]) {
    assert.equal(normalizeZimbabweMobile(number), null);
  }
});

function loadVitalPay() {
  return loadSource("src/lib/fulfillment/vitalpay.ts", {
    "./module-secret": { readModuleSecret: async () => null },
    "@/lib/phone-numbers": { normalizeZimbabweMobile },
    "./vitalpay-shared": loadSource("src/lib/fulfillment/vitalpay-shared.ts"),
  });
}

function mockVitalPayKey(t) {
  const originalKey = process.env.VITALPAY_SECRET_KEY;
  const originalBase = process.env.VITALPAY_BASE_URL;
  process.env.VITALPAY_SECRET_KEY = "test-only-not-a-real-key";
  delete process.env.VITALPAY_BASE_URL;
  t.after(() => {
    if (originalKey === undefined) delete process.env.VITALPAY_SECRET_KEY;
    else process.env.VITALPAY_SECRET_KEY = originalKey;
    if (originalBase === undefined) delete process.env.VITALPAY_BASE_URL;
    else process.env.VITALPAY_BASE_URL = originalBase;
  });
}

test("VitalPay airtime sends E.164 and the exact mapped operator to the documented base URL", async (t) => {
  mockVitalPayKey(t);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ success: true, data: { reference: "provider-test", status: "processing" } }));
  });
  const { VitalPayProvider } = loadVitalPay();
  const result = await new VitalPayProvider().fulfil({
    transactionId: "transaction-test", serviceId: "airtime", recipient: "077 123 4567", networkId: "econet", amount: 2,
    vitalpay: { productId: "econet_zw" },
  });
  assert.equal(result.status, "pending");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://kmgvitallinks.co.uk/api/v1/airtime/purchase");
  assert.equal(requests[0].body.phone, "+263771234567");
  assert.equal(requests[0].body.operator_id, "econet_zw");
  assert.equal(requests[0].body.reference, "transaction-test");
  assert.equal("calculation_mode" in requests[0].body, false);
});

test("operator rules accept the new operator_id field and the legacy id field", async (t) => {
  mockVitalPayKey(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    data: { operators: [
      { operator_id: "econet_zw", min: 1, max: 50 },
      { id: "netone_zw", fixed_amounts: [5, 1, 2], min: 1, max: 5 },
    ] },
  })));
  const { fetchAirtimeOperatorRules } = loadVitalPay();
  const rules = await fetchAirtimeOperatorRules();
  assert.equal(rules.econet.min, 1);
  assert.equal(rules.econet.max, 50);
  assert.deepEqual(rules.netone.fixedAmounts, [1, 2, 5]);
});
