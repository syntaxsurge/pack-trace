# Pack‑Trace — Hedera + supOS Demo (Director‑Ready)

This script covers the full 7–8 minute cut: custody on Hedera, live ops in supOS, AI alert summaries, and a simple print→scan→handover flow. Times are guide rails—trim as needed.

## Problem (0:00–0:20)
- Shot: Landing page `/`
- Lower‑third: “Counterfeits • Opaque custody • Painful recalls”
- VO: “Counterfeits slip through. Custody is opaque. Recalls are slow. We fix that with verifiable custody and real‑time operations.”

## Solution (0:20–0:45)
- Shot: Stay on hero; hover “Get Started”
- Lower‑third: “Custody → Hedera • Operations → supOS”
- VO: “supOS runs our real‑time factory data (UNS/MQTT/Node‑RED/dashboards); Hedera gives us the public, immutable custody log (HCS/Mirror). We’re using both layers because operations and compliance are different problems.”

## Architecture (0:45–1:05)
- Shot: Single diagram: Pack‑Trace → Hedera HCS/Mirror; Pack‑Trace → supOS MQTT/UNS → Database → Dashboards
- VO: “The app signs events to Hedera and publishes JSON to supOS. supOS stores history for operators; HashScan/Mirror provides the public proof.”

## Create Batch (1:05–1:55)
- Shot: Log in as Manufacturer → `/batches/new`
- Fill exactly:
  - Product: Ibuprofen 200mg Tablets
  - GTIN: 07612345678900
  - Lot: IBU‑72B
  - Expiry: 2027‑06‑30
  - Quantity: 240
- Click Create → land on `/batches/[id]` (label preview + on‑chain panel)
- VO: “We register a GS1 batch with print‑ready labeling and on‑chain context.”

## Print → Tape → Scan (1:55–2:30)
- Shot: Click Print; tape the label to the package.
- Cut: `/scan`; webcam parses the label; details appear.
- VO: “We print and tape the label to the package, then scan it to capture the batch details.”

## Manufacturer Handover (2:30–3:00)
- Shot: `/scan` → Handover → choose Distributor (toast confirms)
- Lower‑third: “Outbox QoS‑1 → MQTT 1883 → supOS”
- VO: “We hand over to the distributor; the event is persisted and streamed to supOS.”

## Distributor Receive (3:00–3:25)
- Shot: Distributor → `/scan` → Receive
- VO: “Only the intended recipient can receive while a pending handover exists.”

## Distributor Handover → Pharmacy (3:25–3:50)
- Shot: Distributor → `/scan` → Handover → Pharmacy
- VO: “Custody moves downstream.”

## Pharmacy Receive (3:50–4:15)
- Shot: Pharmacy → `/scan` → Receive
- VO: “Pharmacy confirms receipt; dispense unlocks.”

## Pharmacy Dispense (4:15–4:40)
- Shot: Pharmacy → `/scan` → Dispense
- VO: “Only the current owner with pharmacy role can dispense.”

## Hedera Proof: HashScan (4:40–5:10)
- Shot: `/batches/[id]` → “View on HashScan”; show matching sequence numbers and timestamps
- VO: “Public proof—sequence numbers and timestamps align with our custody trail.”

## supOS Namespace + Topics (5:10–6:00)
- Shot: supOS → Namespace → modeled topics (History ON)
- Lower‑third: “trace/events = canonical custody stream (real‑time)”
- VO: “`trace/events` is the canonical custody stream used by dashboards—this is real‑time from the app.”
- Lower‑third: “trace/sensors/tempC = cold‑chain telemetry (simulated)”
- VO: “`trace/sensors/tempC` carries temperature telemetry. For the demo it’s simulated to illustrate the operations view.”
- Lower‑third: “trace/alerts/coldchain = breach summaries (simulated)”
- VO: “`trace/alerts/coldchain` summarizes sustained temperature breaches—also simulated here to demonstrate alerting and history.”
- VO (production note): “In production you don’t put a sensor on every pack—you instrument the environment and logistics units (room, truck, shipper, pallet) and map that telemetry to the relevant batches.”

### Production cold‑chain VO detail (insert here, ~20–30s)
- VO: “In production we keep costs low by measuring at the lane, room, truck, or shipper/pallet level—not item level. A common setup is ESP32 with a DS18B20 probe publishing JSON to MQTT, or BLE tags with a small gateway.”
- VO: “Sensors publish raw readings, for example `devices/<deviceId>/tempC` with `{ value, ts, deviceId }`. In the app we record an attach/detach mapping between `deviceId` and `batchId` when loading a shipper or pallet.”
- VO: “A tiny bridge (Node‑RED or server route) looks up that mapping and republishes to our canonical `trace/sensors/tempC` with `{ value, ts, deviceId, batchId }`. The cold‑chain flow then emits `trace/alerts/coldchain` and calls the AI summariser—no UI changes required.”

## AI Summariser (cold‑chain) (6:00–6:50)
- Shot: Event Flow (Node‑RED) → open the cold‑chain flow; highlight HTTP node to `/api/ai/summarize-coldchain`.
- Lower‑third: “AI summariser via /api/ai/summarize-coldchain”
- VO: “When temperature stays above threshold, we call an AI summariser. With `OPENAI_API_KEY` set it generates a concise operator summary; otherwise we fall back to a deterministic summary so the flow still works.”
- Shot: Show a generated alert with `summary`.

## Dashboards (6:50–7:30)
- Shot: supOS → Dashboards → table bound to `trace/events` ordered by `ts` desc; optional alert list for cold‑chain
- VO: “Dashboards update immediately. Operators see who acted and when, with on‑ledger references; telemetry and AI‑summarised alerts provide cold‑chain context.”

## Outro (7:30–7:50)
- Shot: supOS dashboard and Pack‑Trace `/batches/[id]` side‑by‑side
- VO: “supOS runs live operations; Hedera provides the public, immutable custody trail. Together they answer: where it was—and whether it was handled safely.”

---

## Staging Checklist (off‑camera)

- App
  - `pnpm dev` (use 3000) and profiles logged in (Manufacturer, Distributor, Pharmacy, Auditor).
  - Hedera env set: `NEXT_PUBLIC_NETWORK`, `HEDERA_OPERATOR_ACCOUNT_ID`, `HEDERA_OPERATOR_DER_PRIVATE_KEY`, `HEDERA_TOPIC_ID`.
  - Outbox worker: `pnpm worker:supos`.
- supOS
  - Gateway: `http://<host>:8088/home` (e.g., `http://192.168.1.4:8088/home`).
  - Grafana remapped to `http://<host>:3300` if running locally with CE compose.
  - Modeled topic `trace/events` with History ON (Mock OFF); dashboard table bound to `trace/events`.
  - Optional: modeled `trace/sensors/tempC`, `trace/alerts/coldchain` (simulated) with History ON; imported cold‑chain Event Flow.
- Print/scan
  - Print label, tape to a box; bright, diffuse light; scan at ~20 cm.

## Helpful Commands (for narration or cut‑ins)

- Start worker: `pnpm worker:supos`
- Start app: `pnpm dev`
- Temperature simulator (demo): `pnpm sim:temp -- <batchId>` (publishes to `trace/sensors/tempC`)
- AI test (manual):
  ```bash
  curl -s -X POST http://localhost:3000/api/ai/summarize-coldchain \
    -H "content-type: application/json" \
    -d '{
      "batchId":"88c551d1-f361-4c22-b293-bf6f7aa349ab",
      "windowMinutes":10,
      "maxTemp":8.0,
      "samples":[
        {"ts":"2025-10-30T15:20:05.000Z","value":8.2},
        {"ts":"2025-10-30T15:25:05.000Z","value":8.9},
        {"ts":"2025-10-30T15:30:05.000Z","value":8.7}
      ]
    }'
  ```

## Notes (for VO improvisation)
- “Operations and compliance are different problems: supOS is the real‑time bus and UI; Hedera is the public trust layer.”
- “Custody events are real‑time; tempC and cold‑chain alerts are simulated here to illustrate the live operations view.”
- “In production, use ESP32/BLE/LoRaWAN/cellular loggers at room/shipper/pallet level and map readings to batches.”
