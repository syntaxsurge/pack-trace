# Pack‑Trace — Hedera + supOS Demo (Director‑Ready)

This script covers the full 7–8 minute cut: custody on Hedera, live ops in supOS, AI alert summaries, and a simple print→scan→handover flow. Times are guide rails—trim as needed.

## 1. Problem (0:00–0:20)
- Shot: Landing page `/`
- VO: “Counterfeits and quality failures cost lives—WHO says at least 1 in 10 medical products in Low and Middle-Income Countries is substandard or falsified. In the U.S., Drug Supply Chain Security Act now pushes interoperable, electronic tracking because paper trails fail. Temperature excursions remain a logistics risk, demanding continuous monitoring. Our demo ties it together: public custody on Hedera, live monitoring in supOS.”

## 2. Solution (0:20–0:45)
- Shot: Stay on hero; hover “Get Started”
- Lower‑third: “Custody → Hedera • Operations → supOS”
- VO: “supOS runs our real‑time factory data (UNS/MQTT/Node‑RED/dashboards); Hedera gives us the public, immutable custody log (HCS/Mirror). We’re using both layers because operations and compliance are different problems.”

## 3. Create Batch (1:05–1:55)
- Shot: Log in as Manufacturer → `/batches/new`
- VO: “We’re logged in as Manufacturer. On the Create Batch form, enter the fields: Product, GTIN, Lot, Expiry, and Quantity.”
- Fill exactly:
  - Product: Ibuprofen 200mg Tablets
  - GTIN: 07612345678900
  - Lot: IBU‑72B
  - Expiry: 2027‑06‑30
  - Quantity: 240
- Click Create → land on `/batches/[id]` (label preview + on‑chain panel)
- VO: “Batch created; label preview and on‑chain panel are ready.”

## 4. Print → Tape → Scan (1:55–2:30)
- Shot: Click Print; tape the label to the package.
- Cut: `/scan`; webcam parses the label; details appear.
- VO: “We print and tape the label to the package, then scan it to capture the batch details.”

## 5. Manufacturer Handover (2:30–3:00)
- Shot: `/scan` → Handover → choose Distributor (toast confirms)
- Lower‑third: “Outbox QoS‑1 → MQTT 1883 → supOS”
- VO: “Still logged in as Manufacturer, we hand over to the Distributor; the event is notarized on Hedera—click ‘View on HashScan’ to see the on‑chain sequence number—and it’s then persisted and streamed to supOS.”

## 6. Distributor Receive & Handover → Pharmacy (3:00–3:40)
- VO: “Log out as Manufacturer, then log in as Distributor.”
- Shot: Distributor → `/scan` → Receive
- VO: “As Distributor, we scan the barcode on the package, then we receive the batch.”
- Shot: Still as Distributor → `/scan` → Handover → choose Pharmacy
- VO: “Then we hand over to Pharmacy—the on‑chain sequence updates, and the handover streams into supOS.”

## 7. Pharmacy Receive & Dispense (3:50–4:20)
- VO: “Log out as Distributor, then log in as Pharmacy.”
- Shot: Log in as Pharmacy → `/scan` → Receive
- VO: “As Pharmacy, we scan the barcode on the package, we receive the batch—on‑chain and supOS both update—and dispense becomes available.”
- Shot: Still as Pharmacy → `/scan` → Dispense
- VO: “We dispense. The final event is recorded on Hedera and reflected in supOS; custody controls are now closed.”

## 8. Overview Dashboard (4:20–4:40)
- Shot: `/dashboard` → facility profile card, stats, recent batches, recent custody events
- VO: “Back on the overview dashboard, we see our facility profile, summary stats, recent batches, and recent custody events. Empty states guide first‑time users to create a batch.”

## 9. Batches List & Actions (4:40–4:55)
- Shot: `/batches` → recent batches table
- VO: “The batches page lists recent batches with quick actions. Open the actions menu to reprint labels, download assets, or jump straight to the timeline.”

## 10. Batch Timeline Page (4:55–5:20)
- Shot: From `/batches` actions → ‘View timeline’ → `/batches/[id]`
- VO: “The batch timeline view shows metadata, custody events, and Hedera links. ‘View on HashScan’ opens the explorer; ‘Open Mirror feed’ shows the raw topic messages. The latest sequence number, topic ID, and links are always visible.”

## 11. Reports Export (5:20–5:40)
- Shot: `/reports` → search by GTIN/lot/product → export PDF or CSV
- VO: “The reports page exports custody as PDF or CSV. The PDF includes a facility certificate with the batch summary, custody timeline, on‑chain sequence references, and an event ledger you can share with auditors.”

## supOS Namespace + Topics (5:40–6:10)
- Shot: supOS → Namespace → modeled topics (History ON)
- Lower‑third: “trace/events = canonical custody stream (real‑time)”
- VO: “`trace/events` is the canonical custody stream used by dashboards—this is real‑time from the app.”
- Lower‑third: “trace/sensors/tempC = cold‑chain telemetry (simulated)”
- VO: “`trace/sensors/tempC` carries temperature telemetry. For the demo it’s simulated to illustrate the operations view.”
- Lower‑third: “trace/alerts/coldchain = breach summaries (simulated)”
- VO: “`trace/alerts/coldchain` summarizes sustained temperature breaches—also simulated here to demonstrate alerting and history.”
- VO: “In production we keep costs low by measuring at the lane, room, truck, or shipper/pallet level—not item level. A common setup is ESP32 with a DS18B20 probe publishing JSON to MQTT, or BLE tags with a small gateway.”

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
