const AGRICULTURE_PATTERN = /agric|farm|field\s*to\s*floor|tobacco|crop|livestock/i;

export function isAgricultureInsuranceProduct(product: {
  name?: string | null;
  category?: string | null;
  description?: string | null;
}): boolean {
  return AGRICULTURE_PATTERN.test(
    `${product.name ?? ""} ${product.category ?? ""} ${product.description ?? ""}`
  );
}
