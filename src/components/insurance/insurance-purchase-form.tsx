"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import type { InsuranceProduct, InsuranceSignupField } from "@/lib/insurance/types";
import { purchaseInsurancePolicy } from "@/lib/actions/insurance";
import { displayName } from "@/lib/insurance/types";

interface InsurancePurchaseFormProps {
  product: InsuranceProduct;
  /** Every purchasable product — powers the "add another cover" picker. */
  allProducts: InsuranceProduct[];
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--input-bg)",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 8,
};

export default function InsurancePurchaseForm({ product, allProducts }: InsurancePurchaseFormProps) {
  const [step, setStep] = useState<"details" | "confirm">("details");
  // The cover picker starts on the product whose page this is; "+ Add
  // another cover" appends more rows so one application can buy several.
  const [selectedIds, setSelectedIds] = useState<string[]>([product.id]);
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [occupation, setOccupation] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [partialFailures, setPartialFailures] = useState<{ productId: string; error: string }[]>([]);

  const purchasable = useMemo(() => allProducts.filter((p) => p.is_purchasable), [allProducts]);
  const selectedProducts = useMemo(
    () => selectedIds.map((id) => purchasable.find((p) => p.id === id)).filter((p): p is InsuranceProduct => Boolean(p)),
    [selectedIds, purchasable]
  );

  // Order summary: sticker price is each product's ORIGINAL TariqifyIMS
  // premium; TopMe's markup is itemised separately as a "Processing fee".
  const premiumTotal = selectedProducts.reduce((sum, p) => sum + p.premium, 0);
  const feeTotal = selectedProducts.reduce((sum, p) => sum + p.premium * (p.markup_percent / 100), 0);
  const grandTotal = premiumTotal + feeTotal;
  const currency = selectedProducts[0]?.currency ?? product.currency;

  function addProductRow() {
    const firstUnused = purchasable.find((p) => !selectedIds.includes(p.id));
    setSelectedIds((ids) => [...ids, firstUnused ? firstUnused.id : ""]);
  }
  function removeProductRow(index: number) {
    setSelectedIds((ids) => ids.filter((_, i) => i !== index));
  }
  function setProductAt(index: number, id: string) {
    setSelectedIds((ids) => ids.map((v, i) => (i === index ? id : v)));
    if (fieldErrors[`product_${index}`]) setFieldErrors((p) => ({ ...p, [`product_${index}`]: "" }));
  }

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPartialFailures([]);

    // Per-field validation — flag exactly what's missing/invalid rather
    // than failing silently or surfacing a generic server error.
    const errs: Record<string, string> = {};
    const ids = selectedIds.filter(Boolean);
    if (ids.length === 0) errs.product_0 = "Choose at least one cover.";
    selectedIds.forEach((id, i) => {
      if (!id) errs[`product_${i}`] = "Select a cover.";
    });
    if (!fullName.trim()) errs.fullName = "Enter your full name.";
    if (!nationalId.trim()) errs.nationalId = "Enter your national ID number.";
    if (!phone.trim()) errs.phone = "Enter your phone number.";
    else if (!/^[+0-9][0-9\s-]{6,}$/.test(phone.trim())) errs.phone = "That doesn't look like a valid phone number.";
    if (!email.trim()) errs.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "That doesn't look like a valid email address.";
    setFieldErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    setLoading(true);
    try {
      const result = await purchaseInsurancePolicy({
        productIds: ids,
        nationalId: nationalId.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        dateOfBirth: dob || undefined,
        address: address.trim() || undefined,
        occupation: occupation.trim() || undefined,
        fieldValues,
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success) {
        setPartialFailures(result.failures ?? []);
        setStep("confirm");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: InsuranceSignupField) => {
    const common = {
      required: field.required,
      value: fieldValues[field.key] || "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setFieldValues({ ...fieldValues, [field.key]: e.target.value }),
      style: inputStyle,
    };
    switch (field.type) {
      case "number":
        return <input type="number" placeholder={field.placeholder || field.label} {...common} />;
      case "date":
        return <input type="date" {...common} />;
      case "select":
        return (
          <select {...common}>
            <option value="">Select {field.label}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "phone":
        return <input type="tel" placeholder={field.placeholder || field.label} {...common} />;
      case "email":
        return <input type="email" placeholder={field.placeholder || field.label} {...common} />;
      case "text":
      default:
        return <input type="text" placeholder={field.placeholder || field.label} {...common} />;
    }
  };

  const fieldError = (key: string) =>
    fieldErrors[key] ? <div style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{fieldErrors[key]}</div> : null;

  if (step === "confirm") {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: "var(--success-bg)",
            color: "var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <Icon name="check" size={40} stroke={2} />
        </div>
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>
          {selectedProducts.length > 1 ? "Cover Purchased Successfully!" : "Policy Purchased Successfully!"}
        </h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
          Your cover is registered with the underwriter and active per their policy rules. You can view it in your account.
        </p>
        {partialFailures.length > 0 && (
          <div
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: 12,
              background: "#FEF6E7",
              color: "var(--warning)",
              fontSize: 12.5,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Some covers didn&apos;t go through:</div>
            {partialFailures.map((f) => (
              <div key={f.productId}>
                · {displayName(purchasable.find((p) => p.id === f.productId) ?? product)}: {f.error}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => (window.location.href = "/account")}
          className="btn btn-primary btn-block"
          style={{ textDecoration: "none" }}
        >
          View My Policies
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePurchase}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ---- Which cover ---- */}
        <div>
          <label style={labelStyle}>Which cover would you like? *</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedIds.map((id, index) => (
              <div key={index} className="row gap-2" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <select
                    value={id}
                    onChange={(e) => setProductAt(index, e.target.value)}
                    style={{ ...inputStyle, borderColor: fieldErrors[`product_${index}`] ? "var(--error)" : "var(--border)" }}
                  >
                    <option value="">Select a product…</option>
                    {purchasable.map((p) => (
                      <option key={p.id} value={p.id} disabled={selectedIds.includes(p.id) && p.id !== id}>
                        {displayName(p)} (${p.premium.toFixed(2)}/mo)
                      </option>
                    ))}
                  </select>
                  {fieldError(`product_${index}`)}
                </div>
                {selectedIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProductRow(index)}
                    className="btn btn-ghost"
                    style={{ height: 44, padding: "0 12px", flexShrink: 0 }}
                    aria-label="Remove cover"
                  >
                    <Icon name="x" size={16} stroke={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {selectedIds.length < purchasable.length && (
            <button
              type="button"
              onClick={addProductRow}
              className="btn btn-ghost btn-block mt-2"
              style={{ border: "1px dashed var(--border)", color: "var(--accent)", fontWeight: 600 }}
            >
              + Add Another Product
            </button>
          )}
        </div>

        {/* ---- Personal details ---- */}
        <div>
          <label style={labelStyle}>Full Name *</label>
          <input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: "" })); }}
            style={{ ...inputStyle, borderColor: fieldErrors.fullName ? "var(--error)" : "var(--border)" }}
          />
          {fieldError("fullName")}
        </div>

        <div className="row gap-2" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>National ID *</label>
            <input
              type="text"
              placeholder="e.g. 63-1234567A89"
              value={nationalId}
              onChange={(e) => { setNationalId(e.target.value); if (fieldErrors.nationalId) setFieldErrors((p) => ({ ...p, nationalId: "" })); }}
              style={{ ...inputStyle, borderColor: fieldErrors.nationalId ? "var(--error)" : "var(--border)" }}
            />
            {fieldError("nationalId")}
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Date of Birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div className="row gap-2" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Phone Number *</label>
            <input
              type="tel"
              placeholder="+263 78 008 6178"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: "" })); }}
              style={{ ...inputStyle, borderColor: fieldErrors.phone ? "var(--error)" : "var(--border)" }}
            />
            {fieldError("phone")}
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Email Address *</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" })); }}
              style={{ ...inputStyle, borderColor: fieldErrors.email ? "var(--error)" : "var(--border)" }}
            />
            {fieldError("email")}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Address</label>
          <input
            type="text"
            placeholder="Street, suburb, city"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Occupation</label>
          <input
            type="text"
            placeholder="Optional"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* ---- Product-specific dynamic fields ---- */}
        {selectedProducts.flatMap((p) =>
          p.signup_fields.map((field) => (
            <div key={`${p.id}-${field.key}`}>
              <label style={labelStyle}>
                {field.label}
                {field.required && " *"}
              </label>
              {renderField(field)}
              {field.helpText && (
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {field.helpText}
                </div>
              )}
            </div>
          ))
        )}

        {/* ---- Payment method ---- */}
        <div>
          <label style={labelStyle}>How would you like to pay? *</label>
          <div
            className="row gap-2"
            style={{
              border: "1.5px solid var(--accent)",
              borderRadius: 12,
              padding: "14px 16px",
              background: "var(--accent-bg)",
              alignItems: "center",
            }}
          >
            <div className="ibadge round" style={{ width: 36, height: 36, background: "var(--accent)", color: "#fff", flexShrink: 0 }}>
              <Icon name="wallet" size={17} stroke={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>TopMe Wallet</div>
              <div className="muted" style={{ fontSize: 11.5 }}>Charged instantly from your wallet balance.</div>
            </div>
            <Icon name="check" size={18} stroke={2.4} />
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: "var(--error-bg)",
              color: "var(--error)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* ---- Order summary: original premium + itemised processing fee ---- */}
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Order Summary</div>
          {selectedProducts.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
              <span>{displayName(p)}</span>
              <span>{p.currency} {p.premium.toFixed(2)}/mo</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8 }}>
            <span className="muted">Premium{selectedProducts.length > 1 ? "s" : ""}:</span>
            <span>{currency} {premiumTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
            <span className="muted">Processing fee:</span>
            <span>{currency} {feeTotal.toFixed(2)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 15,
              fontWeight: 700,
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid var(--accent)",
            }}
          >
            <span>Charged today:</span>
            <span>{currency} {grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-block"
          style={{
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Processing…" : `Continue to Payment · ${currency} ${grandTotal.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}
