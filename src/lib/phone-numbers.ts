/** Zimbabwe mobile numbers accepted locally, normalized for provider APIs. */
export function normalizeZimbabweMobile(value: string): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s()-]/g, "");
  const normalized = phone.startsWith("00263")
    ? `+${phone.slice(2)}`
    : phone.startsWith("263")
      ? `+${phone}`
      : phone.startsWith("0")
        ? `+263${phone.slice(1)}`
        : phone;
  return /^\+2637\d{8}$/.test(normalized) ? normalized : null;
}
