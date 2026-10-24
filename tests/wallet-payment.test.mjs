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
const input = { serviceId: "airtime", serviceName: "Airtime", amount: 2, recipient: "0770000000", networkId: "econet" };

function fixture(options = {}) {
  const calls = { debits: 0, deliveries: 0, refunds: 0, errors: [] };
  const tx = { id: "transaction", reference: "TPM-test", amount: 2, fee: 0.04, fulfillment_status: "pending", created_at: "2026-10-24T00:00:00Z" };
  const session = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: "customer" } } }) },
    rpc: async (name) => {
      assert.equal(name, "wallet_pay");
      calls.debits++;
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
    fulfil: async () => {
      calls.deliveries++;
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
    assert.equal(f.calls.deliveries, 1);
    assert.equal(f.calls.refunds, 0);
  });
}
