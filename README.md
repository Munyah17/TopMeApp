# TopMe

Zimbabwe's digital convenience store — top up airtime, data, ZESA, DStv, insurance, connectivity,
gadgets, school fees, government fees and fuel, all from one wallet.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind v4)
- Supabase (Postgres + Auth + Row Level Security)
- Paynow Zimbabwe, Stripe and EcoCash Instant USSD for wallet top-ups
- Pluggable fulfillment layer (`src/lib/fulfillment`) — simulated by default, wired for
  VitalPay (Tayari / KMG Vital Links) once credentials are added

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a Supabase project, then copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Run the database migration — open the Supabase SQL Editor and run, in order:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
4. Generate an encryption key for API module secrets and set it as `API_ENCRYPTION_KEY`:
   ```bash
   openssl rand -hex 32
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```
6. Sign up for an account in the app, then promote yourself to Super Admin (this can't be
   done from the UI on purpose — no client-side role switching):
   ```sql
   update public.profiles set role = 'superadmin' where email = 'you@example.com';
   ```

## Payment gateways

Each gateway is optional and only activates once its env vars are set (see `.env.example`):

- **Paynow** — hosted checkout redirect; `PAYNOW_RESULT_URL` must point at
  `/api/wallet/topup/paynow/callback` on your deployed domain.
- **Stripe** — Checkout Session; add a webhook endpoint pointing at
  `/api/wallet/topup/stripe/webhook` for the `checkout.session.completed` event.
- **EcoCash Instant USSD** — `src/lib/payments/ecocash.ts` is wired to the common
  EcoCash merchant C2B push/poll shape, but the exact field names and base URL are
  placeholders — confirm them against your EcoCash merchant onboarding pack.

## Fulfillment

Wallet debits are real and atomic (`wallet_pay` Postgres RPC). Actually delivering a
top-up/bill payment to the underlying biller is simulated until a superadmin activates a
real aggregator from **Admin → APIs Management**. `src/lib/fulfillment/vitalpay.ts` is the
integration point for VitalPay — fill in the API call once credentials are available.

## Project structure

- `src/app/(marketing)` — public landing page
- `src/app/(auth)` — login / signup
- `src/app/(app)` — authenticated app shell (home, services, wallet, history, account, admin)
- `src/lib/supabase` — browser/server/admin Supabase clients + route-protection middleware
- `src/lib/actions` — server actions (payments, wallet, favorites, account, admin)
- `src/lib/payments` — Paynow / Stripe / EcoCash gateway clients
- `src/lib/fulfillment` — pluggable biller fulfillment providers
- `supabase/schema.sql`, `supabase/seed.sql` — database schema and catalog seed data
