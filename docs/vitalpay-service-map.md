# VitalPay service mapping audit

Observed: 2026-10-24. Source: read-only TopMe database inventory, current fulfillment code, and the API reference supplied by the owner. No live purchase was made.

The database has 63 service entries and 8 enabled VitalPay mappings covering 7 service IDs. These are existing routing settings, not a fresh confirmation that every product remains available to the current key.

## Existing enabled routes

| TopMe service | Network | Stored product | Effective API target |
|---|---|---|---|
| airtime | econet | econet | POST /airtime/purchase; econet_zw |
| airtime | netone | netone | POST /airtime/purchase; netone_zw |
| bulawayo_city_council | — | bulawayo_city_zw | POST /bills/pay; biller_code=bulawayo_city_zw |
| dstv | — | dstv_zw | POST /bills/pay; biller_code=dstv_zw |
| schoolfees | — | edu_msu_zw | POST /bills/pay; biller_code=edu_msu_zw |
| telone | — | telone_zw | POST /bills/pay; biller_code=telone_zw |
| zesa | — | zedc | POST /electricity/purchase; country=ZW (stored zedc is not sent as a biller code) |
| zol | — | zol_zw | POST /bills/pay; biller_code=zol_zw |

Econet and NetOne are active network entries. Telecel is inactive and has no enabled VitalPay mapping. Its current provider availability has not been rechecked.

**School fees is not every school:** the existing default points to MSU (`edu_msu_zw`). The implementation accepts an explicit institution code in `extraValue`. Do not route an arbitrary school payment to MSU. Separate CUT/MSU/HIT/NUST/UZ products need exact catalog matches before enabling their routes.

## Remaining services

These services have no enabled VitalPay mapping in the inspected database. This does **not** establish that VitalPay cannot offer them now.

- **airtimedata (3):** `airtimevouchers`, `data`, `socialbundles`.

- **connectivity (6):** `africom`, `esim`, `ethernetcables`, `routers`, `starlink`, `utande`.

- **education (5):** `cut`, `hit`, `msu`, `nust`, `uz`.

- **gadgets (5):** `accessories`, `gadgetrouters`, `laptops`, `phones`, `screens`.

- **gifting (1):** `gift`.

- **government (26):** `beitbridge_municipality`, `bindura_municipality`, `chegutu_municipality`, `chinhoyi_municipality`, `chitungwiza_municipality`, `epworth_board`, `govfees`, `gwanda_municipality`, `gweru_city`, `harare_city_council`, `hwange_board`, `kadoma_city`, `kariba_municipality`, `karoi_town`, `kwekwe_city`, `marondera_municipality`, `masvingo_city`, `mutare_city`, `norton_town`, `plumtree_town`, `redcliff_municipality`, `rusape_town`, `ruwa_board`, `shurugwi_town`, `victoriafalls_city`, `zvishavane_town`.

- **utilent (10):** `council`, `fix32kva`, `fix55kva`, `fix62kva`, `fuel`, `lithiumbattery`, `netflix`, `solarpanels`, `spotify`, `vouchers`.

TopMe `gift` vouchers are internal wallet transfers, not external branded gift cards. Physical goods and insurance require their own fulfillment workflows. Do not map them to a generic VitalPay bill-payment endpoint.

## Current reference versus account availability

| Category | Existing TopMe use / next evidence required |
|---|---|
| Airtime | Existing Econet/NetOne routes. Recheck `/airtime/operators?country_iso=ZW` and enabled category access. |
| Mobile data | `/data/operators?country_iso=ZW` is documented. Confirm actual Zimbabwe operators, bundle identity and USD pricing; no data fulfillment handler is implemented yet. |
| Bills | Existing DStv/ZOL/TelOne/Bulawayo/MSU settings. `/bills/billers?country=ZW` determines current billers; examples are not the complete catalog. |
| Electricity | Existing ZESA implementation uses `/electricity/purchase`, country ZW and USD. Supplied reference states a USD 5 minimum. |
| Gift cards | Category existence is documented; exact branded SKUs, currency, country and purchase contract must be confirmed before routing Netflix/Spotify/vouchers. |
| Payment orchestration | Collection of wallet top-ups or checkout funds is separate from delivering airtime/bills. Category access is not authorization to switch payment collection. The legacy gateway module uses a separate default host; reconcile that contract before activating it. |
| Wallet/settlements, virtual cards, analytics, white-label, webhooks | Provider capabilities, not automatic product mappings. Confirm category entitlement and complete the relevant product/security workflow before use. |

`GET /catalog/categories` establishes category access for the actual key. An empty catalog, a disabled category, a 401/403 response and an unimplemented endpoint are different findings; none should silently activate customer routing.

## Read-only refresh

Securely bind a rotated `VITALPAY_SECRET_KEY` to `kmgvitallinks.co.uk` in environment settings, then run:

```bash
cd /workspace/TopMeApp
NODE_USE_ENV_PROXY=1 node scripts/audit-vitalpay.mjs
```

The audit uses GET requests only, emits selected public catalog fields and exact USD candidate matches, and never modifies mappings, activates services, reads balances, or purchases products. Candidate rows are suggestions for review. It rejects missing currency evidence and will not default generic schools/councils to a specific institution.

The authenticated refresh completed on 2026-10-24 after the key was securely supplied. Keys were not copied into source, scripts, tool arguments, or repository files.

## Authenticated catalog findings

- Enabled categories: payments, airtime, bills, electricity, gift_cards, virtual_cards, wallet, webhooks. White-label and analytics are disabled.
- Zimbabwe airtime: Econet (`econet_zw`) and NetOne (`netone_zw`). Telecel was not returned. NetOne accepts USD 0.50, 1, 2, 5, 10, 20 and 50.
- Zimbabwe data: zero operators returned; do not enable data bundles from category access alone.
- Bills: 17 billers returned. Existing DStv, ZOL, TelOne, Bulawayo and MSU codes are present.
- Additional exact matches for existing TopMe services: Norton Town Council (`norton_council_zw` → `norton_town`), CUT (`edu_cut_zw` → `cut`), HIT (`edu_hit_zw` → `hit`), and MSU (`edu_msu_zw` → `msu`). These matches have not been activated by the audit and bill fulfillment has not been purchased as a test.
- Other available billers without dedicated TopMe entries: Highlands Residents Association, Catholic University, Zimbabwe Open University, Reformed Church University, Solusi University, Lupane State University, Sunrise International School, Acacia Junior School and CUZ Applications. An explicit institution/account workflow is required; never route these to the MSU default.
- Gift-card discovery returned 17 products spanning Zimbabwe and US entries even with `country=ZW`. Country filtering must be enforced locally. Netflix and Spotify were not returned. Generic vouchers, eSIMs, crypto products and foreign-region cards are not enabled by this audit.

Two owner-authorized NetOne direct-API recharges, USD 5 and USD 2, were confirmed completed in provider history. This verifies live NetOne fulfillment, not the authenticated TopMe wallet checkout. A prefixed test reference was rejected with `external_id is invalid`; retrying the confirmed-failed order using the bare UUID format already used by the app succeeded. Keep fulfillment references in the app's UUID format, and reconcile uncertain responses before retrying. No customer phone numbers or order references are included in this report.

## Airtime request correction

TopMe accepts local numbers such as `077 123 4567`; provider requests require E.164. Wallet and guest checkout now normalize Zimbabwe mobile numbers before charging, and the provider normalizes defensively. Invalid numbers fail before wallet debit. This corrects a documented request mismatch; it does not prove that this was the only cause of the reported live failure.
