# Demo Runbook

End-to-end script for the 10-minute hackathon recording. Follow this checklist to capture every custody hop, on-chain proof, and supOS alert in a single pass.

## Pre-demo Checklist

### Application and Hedera
- Reset local data and start the dev server: `pnpm db:reset && pnpm dev`.
- `.env` must include `HEDERA_TOPIC_ID`, `HEDERA_OPERATOR_ACCOUNT_ID`, `HEDERA_OPERATOR_DER_PRIVATE_KEY`, and `NEXT_PUBLIC_NETWORK=testnet`.
- Keep browser profiles authenticated as Manufacturer, Distributor, Pharmacy, and Auditor; leave the tabs signed in but idle.
- Pin (do not open yet) the HashScan topic page and the Hedera Mirror Node JSON endpoint; launch them via in-app buttons during the demo.

### supOS CE
- Start supOS CE and sign in as an admin. The bundle ships with Namespace, Source Flow (Node-RED), Event Flow, internal TimescaleDB/Postgres, and Dashboards.
- Pin two tabs for cut-ins:
  - Namespace view with the modeled topics (`trace/batches/{batchId}/events`, `trace/batches/{batchId}/sensors/tempC`, `trace/batches/{batchId}/alerts/coldchain`).
  - Dashboards view with the `Traceability Live` board (custody table, temperature chart, cold-chain alerts).
- Run `pnpm worker:supos` to drain the outbox and `pnpm sim:temp <batchId>` for the synthetic temperature stream.

### Label Printing and Scanning
- Print GS1 labels at 100 percent scale with a quiet zone at least one module wide on each edge.
- Tape the label to a matte, light-colored box. Avoid curved surfaces or glare.
- Use bright, diffuse lighting and keep the webcam about 20 cm from the label when scanning.

### Window Layout
- Left monitor: Pack-Trace UI (switch profiles in one window).
- Right monitor: supOS Namespace and Dashboard tabs.
- Optional picture-in-picture: terminal tailing `pnpm worker:supos`.

## Role Timeline

| Segment (mm:ss) | App user | Primary page | supOS tab |
| --- | --- | --- | --- |
| 00:00-01:10 | Manufacturer | `/dashboard` | - |
| 01:10-02:40 | Manufacturer | `/batches/new` then `/batches/[id]` | Namespace (quick peek) |
| 02:40-03:15 | Manufacturer | Print label | - |
| 03:15-03:45 | Manufacturer | `/scan` handover | Dashboard |
| 03:45-04:25 | Distributor | `/scan` receive | Dashboard |
| 04:25-04:55 | Distributor | `/scan` handover | Dashboard |
| 04:55-05:25 | Pharmacy | `/scan` receive | Dashboard |
| 05:25-05:55 | Pharmacy | `/scan` dispense | Dashboard |
| 05:55-07:05 | Any | HashScan, Mirror Node | - |
| 07:05-07:35 | - | - | Namespace |
| 07:35-08:20 | - | - | Dashboard |
| 08:20-09:00 | Public | `/verify` | - |
| 09:00-09:20 | - | Terminal curl | - |
| 09:20-10:00 | Manufacturer | `/batches/[id]` outro | - |

## Ten-Minute Script

Timing notes are flexible; keep each beat concise and factual.

1. **Problem (00:00-00:30)**  
   - Shot: `/dashboard`, overlay "Counterfeits | Opaque custody | Painful recalls".  
   - Voiceover: "Medicine moves through disconnected systems; recalls are slow and risky."

2. **Solution framing (00:30-00:50)**  
   - Shot: remain on `/dashboard`, overlay "Custody -> Hedera | Operations -> supOS".  
   - Voiceover: "Custody is notarised on Hedera; the operations bus runs on supOS."

3. **Architecture (00:50-01:10)**  
   - Shot: single-slide diagram (Pack-Trace <-> supOS <-> Hedera).  
   - Voiceover: "We will walk through creation, custody, and verification end to end."

4. **Create batch (01:10-02:20)**  
   - Shot: `/batches/new` as Manufacturer, submit the Amoxicillin example, land on `/batches/[id]`.  
   - Call out the On-chain panel (topic ID, sequence, explorer links).

5. **Namespace cut-in (01:50-02:10)**  
   - Shot: supOS Namespace showing modeled topics with History ON.

6. **Print and tape (02:20-03:15)**  
   - Shot: print dialog at 100 percent scale, tape label to box, move to `/scan`.  
   - Voiceover: "Printed at GS1 spec; any webcam can decode the DataMatrix."

7. **Manufacturer handover (03:15-03:45)**  
   - Shot: `/scan`, scan box, handover to Distributor.  
   - supOS: dashboard cut-in showing the new handover row.  
   - Voiceover: "Outbox publishes to supOS MQTT:1883 with QoS 1."

8. **Distributor receive (03:45-04:25)**  
   - Shot: Distributor `/scan`, receive step.  
   - supOS: dashboard shows RECEIVE row.  
   - Voiceover: "Only the intended facility can receive while a pending handover exists."

9. **Distributor handover (04:25-04:55)**  
   - Shot: Distributor `/scan`, handover to Pharmacy.  
   - supOS: dashboard updates again.

10. **Pharmacy receive (04:55-05:25)**  
    - Shot: Pharmacy `/scan`, receive.  
    - supOS: dashboard confirms the hop.

11. **Pharmacy dispense (05:25-05:55)**  
    - Shot: Pharmacy `/scan`, dispense.  
    - supOS: dashboard shows dispense; temperature chart ticks if simulator is running.

12. **Hedera proofs (05:55-07:05)**  
    - Shot: `/batches/[id]` -> "View on HashScan", show matching sequence numbers.  
    - Shot: Mirror Node JSON showing the latest message.

13. **Namespace deep dive (07:05-07:35)**  
    - Shot: supOS Namespace, expand events/sensors/alerts topics, confirm History.

14. **Dashboards (07:35-08:20)**  
    - Shot: dashboards filtered to the batch ID showing custody table, temperature chart, and alerts.

15. **Public verify (08:20-09:00)**  
    - Shot: `/verify`, paste the GS1 string, highlight the Hedera link in the response.

16. **Terminal proof (09:00-09:20)**  
    - Shot: terminal running  
      `curl "https://testnet.mirrornode.hedera.com/api/v1/topics/<topicId>/messages?order=desc&limit=1"`.

17. **Outro (09:20-10:00)**  
    - Shot: `/batches/[id]`, closing summary with overlay bullets: Next.js App Router, Supabase RLS, Hedera HCS+Mirror, supOS UNS/Node-RED/Dashboards, Outbox QoS 1.

## Lower-Third Overlays

- "Counterfeits | Opaque custody | Painful recalls"
- "Custody -> Hedera | Operations -> supOS"
- "UNS + Node-RED + Dashboards (real-time ops)"
- "At-least-once delivery: Outbox -> MQTT 1883 -> supOS"
- "Public verify: HashScan + Mirror Node"

## Troubleshooting Narration

- "If the DataMatrix will not scan, reprint at full scale and keep the 1x quiet zone GS1 requires."
- "Step back about 20 cm and add diffuse light; laptop webcams need even illumination."
- "Dashboards refresh instantly because supOS stores history in TimescaleDB/Postgres."

## Reference Links (add to the video description)

- [Pack-Trace repository](https://github.com/syntaxsurge/pack-trace)
- [supOS CE GitHub](https://github.com/FREEZONEX/supOS-CE)
- [supOS community docs](https://suposcommunity.vercel.app/)
- [ZXing JS Data Matrix decoding](https://github.com/zxing-js/library)
- [GS1 DataMatrix quiet zone guidance](https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf)
- [Hedera Mirror Node REST topics API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api/topics)
