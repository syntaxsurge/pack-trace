# pack-trace

pack-trace is a pack-level traceability control plane that combines GS1-compliant labeling, Hedera Consensus Service event signing, and Supabase-authenticated dashboards. The day-one implementation ships a production-ready foundation for manufacturing, distribution, dispensing, and auditing teams.

## Highlights

- Hedera Consensus Service message flows with running hash persistence ([docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)).
- GS1 DataMatrix encoding for `(01) GTIN`, `(10) LOT`, `(17) EXP` using bwip-js ([guideline](https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf)).
- Supabase Postgres schema with facility-scoped row-level security ([RLS reference](https://supabase.com/docs/guides/auth/row-level-security)).
- Custody scanner integrates `/api/facilities` directory results for handover selection, removing the need to memorise facility UUIDs.
- supOS CE Unified Namespace captures custody events, temperature telemetry, and cold-chain alerts to power live operator dashboards.

## Hackathon Scoring Map

- **Innovation**: Combines Hedera custody proofs with supOS Unified Namespace modeling, Node-RED automations, and AI-backed cold-chain summaries so operations and compliance share the same live view.
- **Technical Feasibility**: Implements an at-least-once outbox publisher (`supos_outbox`, `scripts/supos-bridge-worker.ts`) with MQTT QoS 1, SSE streaming for the UI (`/api/stream/supos`), and deterministic fallbacks when the AI summariser is unavailable.
- **Business Value**: Reduces counterfeit and recall risk through GS1-compliant labeling, verifiable handovers, and real-time cold-chain monitoring fed into operator dashboards and public `/verify`.
- **supOS Feature Utilisation**: Uses Namespace topic modeling with History, Node-RED Event Flow (`flows/supos-eventflow-coldchain.json`), internal TimescaleDB/Postgres storage, and Dashboards backed by the default pg data source.
- **Presentation & Delivery**: Ships a scripted demo runbook, environment presets, and profile switching so the 10-minute video captures every custody hop, on-chain proof, and live supOS alert without retakes.

## Architecture

### Frontend
- Next.js App Router ([docs](https://nextjs.org/docs/app)) with Tailwind and shadcn/ui primitives.
- Client-side Supabase browser client for auth interactions.
- Dashboard server components query Supabase directly for stats, recent batches, and custody events.

### Backend
- Route handlers under `app/api/*` apply Supabase service role keys when required, including custody event ingestion (`/api/events`) and facility directory queries (`/api/facilities`).
- REST API surface delivers batch creation (`POST /api/batches`), batch snapshots (`GET /api/batches/:id`), DataMatrix label exports (`GET /api/batches/:id/label`), custody timelines (`GET /api/timeline`), verification (`GET /api/verify`), dispensing receipts (`POST /api/dispense`), and traceability reports (`GET /api/report`).
- Supabase auth cookie middleware guards all private routes except `/`, `/login`, and `/auth/*`.
- Hedera helpers in `lib/hedera` wrap the JavaScript SDK for client creation, topic management, message publishing, and Mirror Node reads.

### Operations Bus
- `lib/supos/*` establishes an MQTT publisher that mirrors custody events into the supOS CE broker (default `mqtt://localhost:1883`) with QoS 1 delivery semantics.
- The Supabase trigger `enqueue_supos_outbox` persists every custody event into `supos_outbox`, allowing `npm run worker:supos` to replay messages until the broker acknowledges publication.
- Topics follow a Unified Namespace shape: `trace/events` carries custody transitions, while `trace/sensors/tempC` and `trace/alerts/coldchain` provide optional cold-chain telemetry and summaries for dashboards.
- supOS converts these topics into modeled entities with History enabled so Dashboards can read from the internal TimescaleDB/Postgres store without additional ETL, while `/api/stream/supos` provides live SSE updates for the workspace UI.

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

## Hedera Integration

- `lib/hedera/client.ts` – caches a server-side `Client` instance (mainnet/testnet/previewnet) using `HEDERA_OPERATOR_ACCOUNT_ID` and `HEDERA_OPERATOR_DER_PRIVATE_KEY`.
- `lib/hedera/topic.ts` – exposes `createTopic()` and `submitTopicMessage()` with message size validation and transaction metadata.
- `lib/hedera/publisher.ts` – `publishCustodyEvent()` serialises a `CustodyEventPayload`, submits it, and returns the SHA-256 payload hash plus Hedera receipt fields for persistence.
- `lib/hedera/mirror.ts` & `lib/hedera/timeline.ts` – fetch and decode Mirror Node topic messages, returning structured custody timeline entries and `links.next` pagination data.
- Example snippets under `lib/hedera/examples/*` mirror the official Hedera docs for topic creation, message submission, and HTS token setup.

**Publishing an event**

```ts
import { publishCustodyEvent } from "@/lib/hedera";

const result = await publishCustodyEvent({
  payload: {
    v: 1,
    type: "HANDOVER",
    batch: { gtin: "09506000134352", lot: "A123", exp: "2025-12-31" },
    actor: { facilityId: "fac_123", role: "DISTRIBUTOR" },
    to: { facilityId: "fac_987" },
    ts: new Date().toISOString(),
    prev: null,
  },
});

// Persist to Postgres
// result.payloadHash -> events.payload_hash
// result.transactionId -> events.hcs_tx_id
// result.sequenceNumber -> events.hcs_seq_no
// result.runningHash -> events.hcs_running_hash
```

**Reading the custody timeline**

```ts
import { fetchCustodyTimeline } from "@/lib/hedera";

const timeline = await fetchCustodyTimeline(process.env.HEDERA_TOPIC_ID!, {
  limit: 25,
  order: "desc",
});

timeline.entries.forEach((entry) => {
  console.log(entry.sequenceNumber, entry.type, entry.consensusTimestamp);
});
```

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   - Copy `.env.example` to `.env.local` (or `.env`) and fill in project-specific values.
   - Required keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   - Optional integrations: Hedera (see section below), Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`), and Africa's Talking (`AT_API_KEY`, `AT_USERNAME`).

### Hedera credentials & topic setup

1. **Create a Hedera developer account (testnet is free)**
   - Register at [portal.hedera.com/register](https://portal.hedera.com/register) and choose the Testnet environment.
   - Copy the *Account ID* and under **More Details** copy the *DER Encoded Private Key* (the Hex key on the main card will not work).
2. **Populate environment variables**
   ```bash
   NEXT_PUBLIC_NETWORK=testnet
   HEDERA_OPERATOR_ACCOUNT_ID=0.0.xxxxxx      # Account ID from the portal
   HEDERA_OPERATOR_DER_PRIVATE_KEY=302e0201... # DER Encoded Private Key
   HEDERA_TOPIC_ID=0.0.yyyyyy                 # Leave empty until the next step
   ```
3. **Create a topic for custody events**
   ```bash
   pnpm tsx -r dotenv/config lib/hedera/examples/topic-create.ts "pack-trace topic"
   ```
   The script loads `.env` via `dotenv`, creates the topic, and prints an ID like `0.0.987654`. Copy that value into `HEDERA_TOPIC_ID`.
4. **Verify (optional)**
   - Paste the topic ID into [HashScan](https://hashscan.io/testnet) to confirm it exists.
   - Run `pnpm tsx -r dotenv/config lib/hedera/examples/topic-submit.ts 0.0.987654 "hello world"` to publish a test message.
5. **Restart the dev server** so `/scan` and related custody timelines can append and read Hedera messages.

3. **Apply database schema**
   - Run the SQL migrations under `supabase/migrations` (`000_init.sql`, `001_add_product_name_to_batches.sql`, etc.) against your Supabase project (`supabase db push` or Supabase Studio SQL editor).

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

6. **supOS configuration**
   1. Start supOS CE (Docker compose bundle) and sign in with an administrator account.
   2. Run `npm run worker:supos` to stream custody events into the supOS broker, and (optionally) feed temperature data using an MQTT simulator or hardware device.
   3. Follow the detailed supOS setup below.

## supOS Setup (end‑to‑end)

Use these steps to bring up supOS CE locally, free port 3000 for the app, model topics, and wire dashboards.

### 1) Install and start supOS CE

- Clone and configure:
  - `cd .. && git clone https://github.com/FREEZONEX/supOS-CE`
  - `cd supOS-CE && vi .env`
    - Set `VOLUMES_PATH` to a writable directory (e.g. `<repo>/supOS-CE/runtime`).
    - Set `ENTRANCE_DOMAIN` to your host IP (e.g. `192.168.1.4`).
    - Leave defaults for other values unless you know you need changes.
- Start supOS CE:
  - `bash bin/install.sh`
  - When prompted for IP selection, keep your chosen `ENTRANCE_DOMAIN`.
  - Wait for the success banner with the login URL (default admin: `supos/supos`).

### 2) Remap Grafana to free port 3000 for the app

- Edit `docker-compose-4c8g.yml` under the `grafana` service:
  - Change `ports: ["3000:3000"]` to `ports: ["3300:3000"]`.
- Recreate Grafana:
  - `docker compose -p supos -f docker-compose-4c8g.yml up -d grafana`
- URLs:
  - supOS gateway: `http://192.168.1.4:8088/home`
  - Grafana: `http://192.168.1.4:3300`

### 3) Run the Pack‑Trace bridge and app

- From the Pack‑Trace repo:
  - Apply DB migrations (latest supOS outbox trigger): `pnpm db:push`
  - Start the supOS outbox worker: `pnpm worker:supos`
  - Start the app on port 3000: `pnpm dev`

### 4) Model topics in supOS Namespace (History ON)

Pack‑Trace publishes custody to a single aggregate topic (no Node‑RED aggregation required):
- `trace/events` (use this for dashboards)

Optional operations topics (helpful for demo UI):
- `trace/sensors/tempC` (simulated temperature telemetry)
- `trace/alerts/coldchain` (AI‑summarised alert entries)

Model the aggregate and (optionally) the ops topics via Reverse Generation.

- Go to Namespace:
  - `http://192.168.1.4:8088/uns` (or via Home → UNS).
- Create the modeled topic for custody events:
  - Click “+ New Topic”, Path: `trace/events`, Data Type: Time Series.
  - Choose “Reverse Generation” and paste the sample JSON below (or select a live unmodeled `trace/events` payload).
  - Ensure “Enable History” is ON. Save.
- Create optional topics for sensors/alerts the same way.

Reverse Generation JSON samples

- `trace/events`
  ```json
  {
    "v": 1,
    "type": "HANDOVER",
    "batch": {
      "id": "88c551d1-f361-4c22-b293-bf6f7aa349ab",
      "gtin": "09506000134352",
      "lot": "AMX-54E",
      "exp": "2025-11-19"
    },
    "actor": { "facilityId": "3684d565-ec60-49e0-a0d8-011f742fb5cb", "role": "STAFF" },
    "to": { "facilityId": "634fbdf2-69e0-40ee-b3a3-d52f775d71ec" },
    "ts": "2025-10-30T15:34:29.950Z",
    "prev": "sha256:4d7bc3e8be8779af50799141f14af7c291f9ec6822df749f052dc302eb02ebdc",
    "meta": {
      "scannerSource": "manual entry",
      "inputMode": "manual",
      "scannedAt": "2025-10-30T15:34:27.401Z",
      "handoverEventId": "1a9bdfe4-f074-4bdf-90c0-4e8e312a7398"
    },
    "event": {
      "id": "829a8610-c1d9-4e06-903f-88a257842bdc",
      "hederaDelivered": true,
      "hcsTxId": "0.0.7154879@1761838644.087622792",
      "hcsSeqNo": 19,
      "hcsRunningHash": "clPbFD0TsvBP+fV5beElPbycwOs40UZ6LbqtsY76NYGXdfcF0CJWq2XRMMMNu/kG",
      "payloadHash": "f3a896d2e4fcc54b4bca54c81014eba8615a6a43c0c92cd181e23d4a68b28fcb"
    }
  }
  ```

- `trace/sensors/tempC`
  ```json
  { "v": 1, "value": 8.6, "ts": "2025-10-30T15:36:05.120Z" }
  ```

- `trace/alerts/coldchain`
  ```json
  {
    "v": 1,
    "kind": "COLDCHAIN_EXCURSION",
    "summary": "Temperature exceeded 8.0°C for ~10 minutes; likely door left open.",
    "windowMinutes": 10,
    "maxTemp": 8.0,
    "samples": [
      { "ts": "2025-10-30T15:20:05.000Z", "value": 8.2 },
      { "ts": "2025-10-30T15:25:05.000Z", "value": 8.7 },
      { "ts": "2025-10-30T15:30:05.000Z", "value": 8.4 }
    ],
    "ts": "2025-10-30T15:31:00.000Z"
  }
  ```

### 5) Configure Data Connection (Source Flow) for the topic

- After creating a modeled topic, open it in Namespace and scroll to “Topology Map”.
- Click the “Data Connection” card. If prompted, select the **node‑red** template and save/deploy.
- This binds the topic to the internal pipeline so History persists and dashboards can query it.

### 6) Build a dashboard

- supOS gateway → Dashboards → “+ New Dashboard”.
- Add a Table bound to `trace/events`; order by `ts` (descending). Save.

### 7) Optional: simulate temperature

- Run the simulator from this repo to populate `trace/sensors/tempC`:
  - `pnpm sim:temp -- <batchId>`
- If you imported the provided cold‑chain Event Flow, alerts will appear under `trace/alerts/coldchain` after a sustained breach.

### Cold‑chain in production

For the demo, `trace/sensors/tempC` and `trace/alerts/coldchain` are simulated so you can exercise the UI quickly. In production you don’t attach a sensor to every pack; you instrument the environment and logistics units, then map telemetry to batches.

- Where to measure
  - Room/vehicle ambient: fixed sensors in cold rooms, staging areas, and trucks.
  - Shipper/carton/pallet level: one logger per insulated shipper or per pallet on critical lanes (sampling).
  - Item level: only for high‑risk products or investigations.

- Low‑cost hardware
  - ESP32 + DS18B20 (Wi‑Fi MQTT, ~$10–$15), BLE tags with a BLE→MQTT gateway, or LoRaWAN/cellular loggers for long‑haul.

- Publish pattern
  - Devices publish raw readings, e.g. `devices/<deviceId>/tempC`:
    ```json
    { "v": 1, "value": 8.4, "ts": "2025-10-31T02:00:00Z", "deviceId": "dev-abc123" }
    ```
  - The app (or a small bridge) maintains an attach/detach mapping (deviceId ↔ batchId with start/end times).
  - A bridge republishes to the canonical topic used by dashboards:
    - Input: `devices/<deviceId>/tempC`
    - Output: `trace/sensors/tempC` with batch metadata:
      ```json
      { "v": 1, "value": 8.4, "ts": "2025-10-31T02:00:00Z", "deviceId": "dev-abc123", "batchId": "88c551d1-f361-4c22-b293-bf6f7aa349ab" }
      ```
  - The cold‑chain Event Flow can then raise `trace/alerts/coldchain` entries (and call `/api/ai/summarize-coldchain`) without UI changes.

Note: custody events on `trace/events` are live production writes; tempC and cold‑chain alerts are mocked only for the demo.

## Ports & URLs (defaults in this setup)

- Pack‑Trace app: `http://localhost:3000`
- supOS gateway: `http://192.168.1.4:8088/home` (adjust to your LAN IP)
- supOS Namespace shortcut: `http://192.168.1.4:8088/uns`
- supOS MQTT broker (internal): `mqtt://192.168.1.4:1883`
- Grafana: `http://192.168.1.4:3300` (remapped from 3000)
- Node‑RED (eventflow): `http://192.168.1.4:1889`

## Command Reference (as used in this setup)

- Clone supOS CE: `git clone https://github.com/FREEZONEX/supOS-CE`
- Start supOS CE: `bash bin/install.sh`
- Remap Grafana port and restart: `docker compose -p supos -f docker-compose-4c8g.yml up -d grafana`
- Apply Pack‑Trace migrations: `pnpm db:push`
- Run the worker: `pnpm worker:supos`
- Start the app: `pnpm dev`
- Simulate temperature: `pnpm sim:temp -- <batchId>`

## Notes

- For cold‑chain demo UI, sensors and alerts are simulated; custody events are live.

## Auth & Routing

- `/login` shares the Supabase password flow with `/auth/login` for compatibility with email links.
- `/auth/*` still hosts Supabase confirm, reset, and update routes required for OTP/password flows.
- Middleware redirects unauthenticated requests to `/login` while keeping the marketing landing page and Supabase auth flows public.

## Dashboard Overview

- Stats cards summarise batch, event, and active receipt counts.
- Facility profile section surfaces GS1 prefix, type, and onboarding timestamp.
- Recent batches and custody events lists pull live data subject to RLS filters.
- Quick links point operators toward `/batches/new` when no inventory exists yet.

## Custody Scanner

- `/scan` renders the `ScannerClient`, combining the progressive `useScanner` hook (BarcodeDetector primary, ZXing fallback) with Supabase lookups.
- The facility directory loads from `/api/facilities`, giving operators a searchable destination list with manual overrides for auditors.
- Custody actions invoke `/api/events` to persist `RECEIVED`, `HANDOVER`, and `DISPENSED` hops, returning Hedera metadata and SHA-256 payload hashes for audit surfaces.

## Batch Labeling

- `/batches/new` collects product name, GTIN, lot, expiry, and quantity, validating inputs with `lib/labels/gs1`.
- Live previews render GS1 DataMatrix barcodes via `bwip-js/browser` with download and print actions for production labels; `POST /api/batches` responds with GS1 metadata and `/api/batches/:id/label` delivers a ready-to-print PDF export.
- Successful submissions persist GTIN-14, lot, expiry, quantity, human-readable label text, and product name to Supabase while scoping ownership to the operator’s facility.

## Scripts

- `npm run dev` – development server.
- `npm run build` – production build.
- `npm start` – start the production server.
- `npm run lint` – eslint quality checks.
- `npm run typecheck` – TypeScript without emit (required before merging).
- `npm run seed:demo` – provision demo facilities, accounts, batches, events, and receipts in Supabase (requires service role key).
- `npm run worker:supos` – drain the Supabase `supos_outbox` table and publish each record to the supOS MQTT broker with QoS 1 retries.
- `npm run sim:temp -- <batchId>` – stream synthetic temperature telemetry to `trace/sensors/tempC` for dashboards and alert testing (batch ID is only used for logging).

## Demo data & credentials

Run the seeding script once your Supabase project is configured:

```bash
npm run seed:demo
```

The script reads `.env.local`, creates facilities for the manufacturer, distributor, pharmacy, and auditor personas, and loads two batches with full custody histories. By default the password is `TraceDemo!24`; override it by setting `DEMO_SEED_PASSWORD` before running the script.

Demo logins after seeding:

- Manufacturer admin – `manufacturer@packtrace.app`
- Distributor operator – `distributor@packtrace.app`
- Pharmacy technician – `pharmacy@packtrace.app`
- Auditor reviewer – `auditor@packtrace.app`

Each account uses the shared demo password (or the override you provided) and can be rotated safely by re-running the script.

## Demo Runbook

Record the 10-minute walkthrough using the scripted checklist in `docs/demo-runbook.md`. It covers environment preparation, camera/printing tips, user profile sequencing, supOS cut-ins, and narration beats so the final edit captures every custody hop, Hedera proof, and cold-chain alert in a single take.

## Reference Links

- Hedera Consensus Service: [submit a message](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)
- Hedera Mirror Node: [topics REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api/topics)
- GS1 DataMatrix guideline: [PDF](https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf)
- Supabase Next.js quickstart: [guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- supOS CE: [GitHub](https://github.com/FREEZONEX/supOS-CE)
- supOS community docs: [Namespace modeling](https://suposcommunity.vercel.app/category/namespace), [Dashboards](https://suposcommunity.vercel.app/Basic%20Guides/UNS%20Data%20Integration/Dashboards)
