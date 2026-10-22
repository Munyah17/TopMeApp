/**
 * Client-safe VitalPay facts. Payment screens import this file.
 * The API client lives in vitalpay.ts and must not be imported from
 * client components — it reads encrypted API-module keys on the server.
 */

export interface AirtimeOperatorRule {
  /** our network id (econet / netone) */
  networkId: string;
  min: number;
  max: number;
  /** Exact amounts the operator accepts, or null when any amount in [min,max] is fine. */
  fixedAmounts: number[] | null;
}

// Biller ids confirmed live via GET /bills/billers?country=ZW.
export const BILLERS: Record<string, { billerCode: string; billType: string }> = {
  dstv: { billerCode: "dstv_zw", billType: "tv" },
  zol: { billerCode: "zol_zw", billType: "internet" },
  telone: { billerCode: "telone_zw", billType: "telecom" },
  // Bulawayo is the only council in the catalog VitalPay carries a biller for.
  bulawayo_city_council: { billerCode: "bulawayo_city_zw", billType: "municipal" },
  // Default institution. The school-fees handler uses extra.institution when set.
  schoolfees: { billerCode: "edu_msu_zw", billType: "education_university" },
};

/** True when VitalPay can look up an account holder for this service. */
export function supportsBillAccountValidation(serviceId: string): boolean {
  return serviceId in BILLERS;
}
