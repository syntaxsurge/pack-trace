import { serverEnv } from "@/lib/env/server";
import {
  buildHashscanTopicUrl,
  buildMirrorTopicUrl,
} from "@/lib/hedera/links";
import { formatConsensusTimestamp } from "@/lib/hedera/format";
import type { CustodyEventType } from "@/lib/hedera/types";
import type { VerifyState } from "@/lib/verify/types";

const ACTOR_LABELS: Record<CustodyEventType, string> = {
  MANUFACTURED: "Manufacturer",
  HANDOVER: "Distributor",
  RECEIVED: "Distributor",
  DISPENSED: "Pharmacy",
  RECALLED: "Auditor",
};

function maskSerial(serial: string | null): string | null {
  if (!serial) return null;
  const normalized = serial.trim();
  if (!normalized) return null;
  if (normalized.length <= 4) {
    return normalized.padStart(normalized.length, "*");
  }
  const tail = normalized.slice(-4);
  return `${"*".repeat(normalized.length - 4)}${tail}`;
}

export interface PublicVerifyTimelineEntry {
  sequenceNumber: number;
  eventType: CustodyEventType;
  actorLabel: string;
  consensusTimestamp: string;
  formattedTimestamp: string;
}

export interface PublicVerifyState {
  status: VerifyState["status"];
  message: string | null;
  code: string | null;
  parsed: {
    gtin: string;
    lot: string;
    expiry: string;
    serial: string | null;
    maskedSerial: string | null;
  } | null;
  topicId: string | null;
  latestSequence: number | null;
  links: {
    hashscanTopicUrl: string | null;
    mirrorTopicUrl: string | null;
  };
  timeline: PublicVerifyTimelineEntry[];
  timelineNote: string | null;
  timelineError: string | null;
}

export function sanitizeVerifyState(state: VerifyState): PublicVerifyState {
  const topicId = state.topicId ?? null;
  const network = serverEnv.network ?? "testnet";

  const timeline = state.timelineEntries.map((entry) => ({
    sequenceNumber: entry.sequenceNumber,
    eventType: entry.type,
    actorLabel: ACTOR_LABELS[entry.type] ?? "Operator",
    consensusTimestamp: entry.consensusTimestamp,
    formattedTimestamp: formatConsensusTimestamp(entry.consensusTimestamp),
  }));

  const latestSequence =
    timeline.length > 0 ? timeline[0]?.sequenceNumber ?? null : null;

  const parsed = state.parsed
    ? {
        gtin: state.parsed.gtin14,
        lot: state.parsed.lot,
        expiry: state.parsed.expiryIsoDate,
        serial: state.parsed.serial,
        maskedSerial: maskSerial(state.parsed.serial),
      }
    : null;

  const hashscanTopicUrl = topicId
    ? buildHashscanTopicUrl(network, topicId)
    : null;
  const mirrorTopicUrl = topicId
    ? buildMirrorTopicUrl(network, topicId, { limit: 25 })
    : null;

  return {
    status: state.status,
    message: state.message,
    code: state.code,
    parsed,
    topicId,
    latestSequence,
    links: {
      hashscanTopicUrl,
      mirrorTopicUrl,
    },
    timeline,
    timelineNote: state.timelineNote,
    timelineError: state.timelineError,
  };
}
