# PackTrace

[![PackTrace Demo](public/images/pack-trace-demo.png)](https://www.youtube.com/watch?v=hJAu5NF_61I)

### Hackathon Alignment

- Focus: DLT for Operations — applies Hedera to improve healthcare supply chains with verifiable custody and cold‑chain oversight.
- Impact: Reduces counterfeit risk and spoilage through GS1 labeling, public custody proofs (HCS), and real‑time operational visibility (supOS).
- Accessibility: One‑click NodeOps template and public amd64 image enable fast trials across African cities and online participants.

### Quick Links

| Resource | Link |
| --- | --- |
| Pitch Deck | https://www.canva.com/design/DAG3XwUtWbQ/gQ-hhHi7xIjtI0EyhLazyg/edit?utm_content=DAG3XwUtWbQ&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton |
| YouTube Video Demo | https://www.youtube.com/watch?v=hJAu5NF_61I |
| Live Website | https://pack-trace.vercel.app/ |
| Hashgraph Developer Course Certificate | https://drive.google.com/file/d/10fQnK3CINl5sH9a2s4m0pUzO2I9Lo_QH/view?usp=sharing |
| NodeOps Template URL (For easy deployment) | https://cloud.nodeops.network/marketplace/d42cgfkc6prc7390ivcg |

### Demo Logins (seeded)

Fastest way to test: Use these default seeded credentials to sign in on the Live Website (https://pack-trace.vercel.app/):

- Manufacturer admin – `manufacturer@packtrace.app` / `TraceDemo!24`
- Distributor operator – `distributor@packtrace.app` / `TraceDemo!24`
- Pharmacy technician – `pharmacy@packtrace.app` / `TraceDemo!24`
- Auditor reviewer – `auditor@packtrace.app` / `TraceDemo!24`

## Hedera Integration Summary

### Hedera Consensus Service (HCS)
- Why: Immutable, low-cost logging of critical custody events. Predictable per‑message fees (~$0.0001) ensure operational cost stability for high‑volume, low‑margin logistics.
- How: Backend submits custody payload hashes via `TopicMessageSubmitTransaction`; batch records store the topic ID and references to sequence numbers and running hashes.

### Mirror Node (REST)
- Why: Public, verifiable read path for auditors and UIs without custom indexers.
- How: The app queries Mirror Node REST, decodes base64 payloads, and renders an ordered custody timeline with sequence numbers, consensus timestamps, and HashScan links.

#### Transaction Types
- `TopicCreateTransaction` (one‑time per deployment) to create the custody topic.
- `TopicMessageSubmitTransaction` for each custody event.

#### Economic Justification
- Hedera’s low, predictable fees, high throughput, and ABFT finality make per‑event notarization economically viable and operationally dependable.


## Deployed Hedera IDs (Testnet)
- Operator Account ID: `0.0.7154879`
- HCS Topic ID: `0.0.7163002`
- Smart contracts / HTS tokens: not used in this deployment.


## Deployment & Setup (under 10 minutes)

1) Clone and install
- `git clone https://github.com/syntaxsurge/pack-trace && cd pack-trace`
- `pnpm install` (or `npm install`)

2) Configure environment
- Copy `.env.example` to `.env` and fill:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API)
  - `SUPABASE_SERVICE_ROLE_KEY` (server‑only; keep secret)
  - `NEXT_PUBLIC_NETWORK=testnet`
  - `HEDERA_OPERATOR_ACCOUNT_ID`, `HEDERA_OPERATOR_DER_PRIVATE_KEY` (testnet)
  - `HEDERA_TOPIC_ID` (create next or reuse)

3) Create HCS topic on Testnet (one‑time)
- `pnpm tsx -r dotenv/config lib/hedera/examples/topic-create.ts "pack-trace topic"`
- Paste the returned topic ID into `HEDERA_TOPIC_ID`.

4) Run locally (Testnet)
- Dev: `pnpm dev` → `http://localhost:3000`
- Prod: `pnpm build && pnpm start` → `http://localhost:3000`

5) Seed demo data (optional)
- `pnpm seed:demo` (uses `DEMO_SEED_PASSWORD` if set, default `TraceDemo!24`)

6) supOS (optional)
- Start supOS CE, then run `pnpm worker:supos` to stream custody events to MQTT with QoS 1 retries.

### Running Environment
- Frontend: Next.js App Router served at `http://localhost:3000`.
- Backend: Next.js route handlers under `app/api/*` (no separate server). In Docker, the runtime executes `node server.js` (standalone output).


## Architecture

### Architecture Diagram
```
[ Browser (UI) ] --scan/verify--> [ Next.js API /api/verify ]
        |                                   |
        |  custody events (/api/events)     | TopicMessageSubmitTransaction
        v                                   v
   [ Next.js API /api/events ]  ------>  [ Hedera HCS Topic ]
        ^                                   |
        | Mirror Node REST (timeline)       |
        |                                   v
        +--------<--------- [ Mirror Node ]

   [ Supabase (Postgres/RLS) ] <---- Next.js server components
   [ supOS (MQTT/Namespace/Dashboards) ] <--- outbox worker (QoS 1)
```

### Frontend
- Next.js App Router with Tailwind and shadcn/ui primitives.
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
- Custody events store `hcs_tx_id`, optional `hcs_seq_no`, and `hcs_running_hash` for reconciliation against mirror nodes.


## Hedera credentials & topic setup

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

### Ports & URLs (defaults in this setup)

- Pack‑Trace app: `http://localhost:3000`
- supOS gateway: `http://192.168.1.4:8088/home` (adjust to your LAN IP)
- supOS Namespace shortcut: `http://192.168.1.4:8088/uns`
- supOS MQTT broker (internal): `mqtt://192.168.1.4:1883`
- Grafana: `http://192.168.1.4:3300` (remapped from 3000)
- Node‑RED (eventflow): `http://192.168.1.4:1889`

### Command Reference (as used in this setup)

- Clone supOS CE: `git clone https://github.com/FREEZONEX/supOS-CE`
- Start supOS CE: `bash bin/install.sh`
- Remap Grafana port and restart: `docker compose -p supos -f docker-compose-4c8g.yml up -d grafana`
- Apply Pack‑Trace migrations: `pnpm db:push`
- Run the worker: `pnpm worker:supos`
- Start the app: `pnpm dev`
- Simulate temperature: `pnpm sim:temp -- <batchId>`


## NodeOps Deployment (Template URL + amd64 Image)

Use this when submitting to a marketplace or judge who deploys via a template and public Docker image.

1) Docker Hub setup

- Confirm username: https://hub.docker.com/settings/general
- Create public repo `pack-trace`: https://hub.docker.com/repositories/new (Namespace = your username)
- Generate a Personal Access Token: https://hub.docker.com/settings/security

2) Build and push linux/amd64 image

- Log in:
  ```bash
  docker login -u syntaxsurge
  ```
- Create a builder (once) and push:
  ```bash
  docker buildx create --use --name nodeopsbuilder || true
  # Supply public Supabase vars for Next.js build-time validation
  # One-liner (avoids multi-line quoting issues):
  docker buildx build --platform linux/amd64 -t syntaxsurge/pack-trace:1.0.0 \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="https://isyoifeidgfufyqaevrl.supabase.co" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" \
    --build-arg NEXT_PUBLIC_NETWORK="testnet" \
    --push .
  ```
- Verify architecture and visibility:
  ```bash
  docker buildx imagetools inspect syntaxsurge/pack-trace:1.0.0 | grep -i 'Architecture: amd64'
  ```
- Confirm the repo is public: https://hub.docker.com/repositories

3) Update NodeOps template

- Edit `nodeops_template.yaml:1` and set:
  ```yaml
  image: syntaxsurge/pack-trace:1.0.0
  ```
- Required envs are already defined; NodeOps prompts for values at deploy.

4) Upload template and get the Template URL

- Guide: https://docs.nodeops.network/Guides/Marketplace/Configure-Compute/upload-template
- In My Templates → Create Template:
  - Name, Description, Category, Overview, Use cases, Thumbnail, Tutorial (YouTube), GitHub URL
  - Paste `nodeops_template.yaml`
  - Save, run Deploy Preview, then copy the marketplace page link (Template URL)

Runtime env values (where to find them):
- Supabase URL + anon key: Supabase project → Settings → API
- Service role key: Supabase project → Settings → API (supply at runtime, not build)
- Hedera account/key/topic: https://faucet.hedera.com and HashScan https://hashscan.io/testnet
- supOS MQTT (optional): broker URL and credentials


## Scripts

- `npm run dev` – development server.
- `npm run build` – production build.
- `npm start` – start the production server.
- `npm run lint` – eslint quality checks.
- `npm run typecheck` – TypeScript without emit (required before merging).
- `npm run seed:demo` – provision demo facilities, accounts, batches, events, and receipts in Supabase (requires service role key).
- `npm run worker:supos` – drain the Supabase `supos_outbox` table and publish each record to the supOS MQTT broker with QoS 1 retries.
- `npm run sim:temp -- <batchId>` – stream synthetic temperature telemetry to `trace/sensors/tempC` for dashboards and alert testing (batch ID is only used for logging).
