<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deployment rule (owner directive)

ALWAYS commit and push to GitHub (origin/main) after completing work — no confirmation needed. topme.co.zw deploys automatically via Vercel on push. Never leave finished changes as uncommitted local work; the owner expects the live site to reflect completed changes immediately.

## Paynow BillPay activation hold

The Paynow BillPay Vendor and Biller API implementation is built, but production activation is deliberately paused until Paynow privately issues TopMe's credentials. Do not invent credentials or enable untested customer routing.

When the owner says the BillPay API has arrived and asks to activate it:

1. Add Vendor/Biller credentials and webhook secrets to the deployment environment without committing or logging them.
2. Keep customer routing disabled while running the first authenticated catalog sync.
3. Review the exact billers/products assigned to TopMe; do not assume the full topup.co.zw catalog.
4. Review automatic `service_provider_map` mappings and correct unmatched entries in Admin → APIs.
5. Run controlled `AUTH` tests, then low-value `PAY` tests across each returned category.
6. Verify vouchers, receipt HTML, individual `ReceiptSmses`, pending reconciliation, idempotency, and failure refunds.
7. Enable only tested mappings for customers.

Likely categories, only if returned by TopMe's assigned catalog: ZESA, airtime/data, DStv, TelOne/Liquid broadband, councils, universities/schools, medical aid, funeral-policy installments, utilities, donations, and other local billers. BillPay policy-installment payments are distinct from creating new Motions/Tariqify insurance policies.

## Motions/Tariqify insurance operations

TopMe does not offer agriculture insurance, including Field To Floor/tobacco products. Those are handled manually and privately by the insurer/broker. Keep agriculture products inactive, hidden from storefront/admin catalogs, and blocked at quote/purchase boundaries; preserve old product rows for historical policy references.

TariqifyIMS automatically sends SMS notifications to registered insurance clients: an upcoming invoice reminder on the 25th and an invoice notification on the 1st of each month. TopMe must send the correct customer phone when creating the Tariqify client, but must not duplicate those scheduled SMS messages locally unless the owner explicitly says the upstream behavior has changed.
