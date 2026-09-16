"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { InsuranceProduct, InsuranceSignupField } from "@/lib/insurance/types";
import { purchaseInsurancePolicy } from "@/lib/actions/insurance";
import { displayPremium } from "@/lib/insurance/types";

interface InsurancePurchaseFormProps {
  product: InsuranceProduct;
}

export default function InsurancePurchaseForm({ product }: InsurancePurchaseFormProps) {
  const [step, setStep] = useState<"details" | "confirm">("details");
  const [nationalId, setNationalId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the separate quote step — the premium is already known from the
  // synced product, and purchaseInsurancePolicy registers the client with
  // TariqifyIMS, charges the wallet, and creates the policy in one call.
  const total = displayPremium(product);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await purchaseInsurancePolicy({
      productId: product.id,
      nationalId,
      fullName,
      phone: phone || undefined,
      fieldValues,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.success) {
      setStep("confirm");
    }
  };

  const renderField = (field: InsuranceSignupField) => {
    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            placeholder={field.placeholder || field.label}
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        );
      case "number":
        return (
          <input
            type="number"
            placeholder={field.placeholder || field.label}
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        );
      case "date":
        return (
          <input
            type="date"
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        );
      case "select":
        return (
          <select
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case "phone":
        return (
          <input
            type="tel"
            placeholder={field.placeholder || field.label}
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        );
      case "email":
        return (
          <input
            type="email"
            placeholder={field.placeholder || field.label}
            required={field.required}
            value={fieldValues[field.key] || ""}
            onChange={(e) => setFieldValues({ ...fieldValues, [field.key]: e.target.value })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        );
      default:
        return null;
    }
  };

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
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Policy Purchased Successfully!</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
          Your insurance policy is now active. You can view it in your account.
        </p>
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
        {/* Personal Information */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            National ID *
          </label>
          <input
            type="text"
            placeholder="Enter national ID number"
            required
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Full Name *
          </label>
          <input
            type="text"
            placeholder="Enter full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Phone Number
          </label>
          <input
            type="tel"
            placeholder="Enter phone number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--input-bg)",
              fontSize: 14,
            }}
          />
        </div>

        {/* Dynamic Fields from Product */}
        {product.signup_fields.map((field) => (
          <div key={field.key}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
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
        ))}

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

        {/* Price summary — the synced product premium already includes the
            markup, so there's no separate quote step. The wallet is charged
            this amount on submit. */}
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Order Summary</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>Premium:</span>
            <span>{product.currency} {total.toFixed(2)}/mo</span>
          </div>
          {product.cover_amount != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4 }}>
              <span>Cover amount:</span>
              <span>{product.currency} {product.cover_amount.toFixed(0)}</span>
            </div>
          )}
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
            <span>{product.currency} {total.toFixed(2)}</span>
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
          {loading ? "Processing..." : `Buy for ${product.currency} ${total.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
}
