# pack-trace

pack-trace is a pack-level traceability control plane that combines GS1-compliant labeling, Hedera Consensus Service event signing, and Supabase-authenticated dashboards. The day-one implementation ships a production-ready foundation for manufacturing, distribution, dispensing, and auditing teams.

## Highlights

- Hedera Consensus Service message flows with running hash persistence ([docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)).
- GS1 DataMatrix encoding for `(01) GTIN`, `(10) LOT`, `(17) EXP` using bwip-js ([guideline](https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf)).
- Supabase Postgres schema with facility-scoped row-level security ([RLS reference](https://supabase.com/docs/guides/auth/row-level-security)).
- Next.js App Router UI with authenticated dashboard, invite and recovery flows, and marketing landing page.

## Architecture

### Frontend
- Next.js App Router ([docs](https://nextjs.org/docs/app)) with Tailwind and shadcn/ui primitives.
- Client-side Supabase browser client for auth interactions.
- Dashboard server components query Supabase directly for stats, recent batches, and custody events.

### Backend
- Route Handlers (to be implemented) will live under `app/api/*` and use Supabase service role keys when required.
- Supabase auth cookie middleware guards all private routes except `/`, `/login`, `/auth/*`, and `/verify`.

### Distributed Ledger
- Hedera Consensus Service topic IDs recorded on `batches.topic_id`.
- Custody events store `hcs_tx_id`, optional `hcs_seq_no`, and `hcs_running_hash` for reconciliation against mirror nodes ([topics API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api/topics)).

## Data Model

Defined in `supabase/migrations/000_init.sql`:

- `facilities`: core profile (name, type, country, GS1 company prefix).
- `users`: Supabase-authenticated identities with role (`ADMIN`, `STAFF`, `AUDITOR`) and facility scope.
- `batches`: GTIN, lot, expiry, quantity, current owner facility, label text, Hedera topic, creator.
- `events`: MANUFACTURED/RECEIVED/HANDOVER/DISPENSED/RECALLED entries with Hedera metadata and SHA-256 payload hash.
- `receipts`: pharmacy-issued verification receipts with shortcode and status.

Row-level policies allow auditors full read access while other roles are scoped to their facility through helper functions `get_my_facility()`, `is_admin()`, and `is_auditor()`.

Auth triggers (`public.sync_user_profile`) synchronize `auth.users` changes into `public.users`, normalizing email addresses and keeping display names aligned.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   - Copy `.env.example` to `.env.local` and fill in project-specific values.
   - Required keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Optional integrations: Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) and Africa's Talking (`AT_API_KEY`, `AT_USERNAME`).

3. **Apply database schema**
   - Run the SQL in `supabase/migrations/000_init.sql` against your Supabase project (`supabase db push` or Supabase Studio SQL editor).

4. **Start the dev server**
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000` to access the marketing site. Navigate to `/login` to authenticate.

5. **Type safety and linting**
   ```bash
   npm run lint
   npm run typecheck
   ```

## Auth & Routing

- `/login` shares the Supabase password flow with `/auth/login` for compatibility with email links.
- `/auth/*` still hosts Supabase confirm, reset, and update routes required for OTP/password flows.
- Middleware redirects unauthenticated requests to `/login` while letting `/verify` remain public for patient lookups.

## Dashboard Overview

- Stats cards summarise batch, event, and active receipt counts.
- Facility profile section surfaces GS1 prefix, type, and onboarding timestamp.
- Recent batches and custody events lists pull live data subject to RLS filters.

## Scripts

- `npm run dev` – development server.
- `npm run build` – production build.
- `npm start` – start the production server.
- `npm run lint` – eslint quality checks.
- `npm run typecheck` – TypeScript without emit (required before merging).

## Reference Links

- Hedera Consensus Service: [submit a message](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)
- Hedera Mirror Node: [topics REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api/topics)
- GS1 DataMatrix guideline: [PDF](https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf)
- Supabase Next.js quickstart: [guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
