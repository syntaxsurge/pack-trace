import "dotenv/config";
import crypto from "node:crypto";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "../lib/supabase/admin";
import { serverEnv } from "../lib/env/server";

type FacilityKey =
  | "manufacturer"
  | "distributor"
  | "pharmacy"
  | "auditor";

type DemoFacility = {
  key: FacilityKey;
  name: string;
  type: "MANUFACTURER" | "DISTRIBUTOR" | "PHARMACY" | "AUDITOR";
  country: string;
  gs1CompanyPrefix: string;
};

type DemoUser = {
  key: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "STAFF" | "AUDITOR";
  facility: FacilityKey;
};

type DemoBatch = {
  key: string;
  productName: string;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  labelText: string;
  topicId: string;
  createdAt: string;
  createdBy: string;
  currentOwner: FacilityKey;
};

type DemoEvent = {
  batchKey: string;
  type: "MANUFACTURED" | "RECEIVED" | "HANDOVER" | "DISPENSED";
  fromFacility: FacilityKey;
  toFacility?: FacilityKey | null;
  createdBy: string;
  sequence: number;
  timestamp: string;
  memo: string;
};

type DemoReceipt = {
  batchKey: string;
  pharmacyFacility: FacilityKey;
  shortcode: string;
  patientRef: string;
  createdAt: string;
};

const admin = createAdminClient();
const demoPassword =
  process.env.DEMO_SEED_PASSWORD && process.env.DEMO_SEED_PASSWORD.trim().length > 0
    ? process.env.DEMO_SEED_PASSWORD
    : "TraceDemo!24";
const skipSampleData =
  process.env.DEMO_SEED_SKIP_SAMPLE_DATA === "true";

function logStep(message: string) {
  console.log(`▪️ ${message}`);
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function runningHash(seed: string): string {
  return crypto.createHash("sha384").update(seed).digest("hex");
}

const facilities: DemoFacility[] = [
  {
    key: "manufacturer",
    name: "Helios Pharma Manufacturing",
    type: "MANUFACTURER",
    country: "DE",
    gs1CompanyPrefix: "0950600",
  },
  {
    key: "distributor",
    name: "Northwind Distribution Hub",
    type: "DISTRIBUTOR",
    country: "NL",
    gs1CompanyPrefix: "0950601",
  },
  {
    key: "pharmacy",
    name: "Zenith Care Pharmacy",
    type: "PHARMACY",
    country: "FR",
    gs1CompanyPrefix: "0950602",
  },
  {
    key: "auditor",
    name: "Global Pharma Auditors",
    type: "AUDITOR",
    country: "US",
    gs1CompanyPrefix: "0950609",
  },
];

const users: DemoUser[] = [
  {
    key: "manufacturerLead",
    email: "manufacturer@packtrace.app",
    displayName: "Mara Feld",
    role: "ADMIN",
    facility: "manufacturer",
  },
  {
    key: "distributorOps",
    email: "distributor@packtrace.app",
    displayName: "Devon Kramer",
    role: "STAFF",
    facility: "distributor",
  },
  {
    key: "pharmacyTech",
    email: "pharmacy@packtrace.app",
    displayName: "Sofia Nordin",
    role: "STAFF",
    facility: "pharmacy",
  },
  {
    key: "auditorView",
    email: "auditor@packtrace.app",
    displayName: "Iris Tladi",
    role: "AUDITOR",
    facility: "auditor",
  },
];

const batches: DemoBatch[] = [
  {
    key: "batchA",
    productName: "Amoxicillin 500mg Capsules",
    gtin: "09506000134352",
    lot: "AMX-54A",
    expiry: "2026-03-31",
    qty: 180,
    labelText: "(01)09506000134352(10)AMX-54A(17)260331",
    topicId: "0.0.520001",
    createdAt: "2024-10-01T08:32:15Z",
    createdBy: "manufacturerLead",
    currentOwner: "pharmacy",
  },
  {
    key: "batchB",
    productName: "Metformin 850mg Tablets",
    gtin: "09506000198765",
    lot: "MTF-21C",
    expiry: "2025-12-31",
    qty: 240,
    labelText: "(01)09506000198765(10)MTF-21C(17)251231",
    topicId: "0.0.520001",
    createdAt: "2024-10-05T10:05:00Z",
    createdBy: "manufacturerLead",
    currentOwner: "distributor",
  },
];

const events: DemoEvent[] = [
  {
    batchKey: "batchA",
    type: "MANUFACTURED",
    fromFacility: "manufacturer",
    toFacility: null,
    createdBy: "manufacturerLead",
    sequence: 1,
    timestamp: "2024-10-01T08:35:10Z",
    memo: "Manufactured lot AMX-54A",
  },
  {
    batchKey: "batchA",
    type: "HANDOVER",
    fromFacility: "manufacturer",
    toFacility: "distributor",
    createdBy: "manufacturerLead",
    sequence: 2,
    timestamp: "2024-10-02T09:00:00Z",
    memo: "Shipment transferred to Northwind Distribution",
  },
  {
    batchKey: "batchA",
    type: "RECEIVED",
    fromFacility: "distributor",
    toFacility: "distributor",
    createdBy: "distributorOps",
    sequence: 3,
    timestamp: "2024-10-02T14:12:48Z",
    memo: "Distributor intake confirmation",
  },
  {
    batchKey: "batchA",
    type: "HANDOVER",
    fromFacility: "distributor",
    toFacility: "pharmacy",
    createdBy: "distributorOps",
    sequence: 4,
    timestamp: "2024-10-03T06:40:00Z",
    memo: "Courier handover to Zenith Care Pharmacy",
  },
  {
    batchKey: "batchA",
    type: "RECEIVED",
    fromFacility: "pharmacy",
    toFacility: "pharmacy",
    createdBy: "pharmacyTech",
    sequence: 5,
    timestamp: "2024-10-03T09:05:31Z",
    memo: "Pharmacy stock intake",
  },
  {
    batchKey: "batchA",
    type: "DISPENSED",
    fromFacility: "pharmacy",
    toFacility: null,
    createdBy: "pharmacyTech",
    sequence: 6,
    timestamp: "2024-10-06T16:12:00Z",
    memo: "Dispensed to patient with receipt RX-9K2M",
  },
  {
    batchKey: "batchB",
    type: "MANUFACTURED",
    fromFacility: "manufacturer",
    toFacility: null,
    createdBy: "manufacturerLead",
    sequence: 7,
    timestamp: "2024-10-05T10:07:12Z",
    memo: "Manufactured lot MTF-21C",
  },
  {
    batchKey: "batchB",
    type: "HANDOVER",
    fromFacility: "manufacturer",
    toFacility: "distributor",
    createdBy: "manufacturerLead",
    sequence: 8,
    timestamp: "2024-10-06T11:15:00Z",
    memo: "Shipment moved to Northwind Distribution",
  },
  {
    batchKey: "batchB",
    type: "RECEIVED",
    fromFacility: "distributor",
    toFacility: "distributor",
    createdBy: "distributorOps",
    sequence: 9,
    timestamp: "2024-10-06T17:42:15Z",
    memo: "Distributor intake confirmation",
  },
];

const receipts: DemoReceipt[] = [
  {
    batchKey: "batchA",
    pharmacyFacility: "pharmacy",
    shortcode: "RX-9K2M",
    patientRef: "patient:anita.liu",
    createdAt: "2024-10-06T16:12:02Z",
  },
];

async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.toLowerCase();
  let page = 1;
  const pageSize = 100;

  // Paginate through users until the email is found or the result set ends.
  // For demo environments the first page will usually include every user,
  // but the pagination loop keeps the helper resilient.
  while (true) {
    const response = await admin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (response.error) {
      throw response.error;
    }

    const match =
      response.data.users?.find(
        (candidate) =>
          (candidate.email ?? "").toLowerCase() === normalized,
      ) ?? null;

    if (match) {
      return match as User;
    }

    if (!response.data.users || response.data.users.length < pageSize) {
      break;
    }

    page += 1;
  }

  return null;
}

async function ensureFacility(spec: DemoFacility): Promise<string> {
  const existing = await admin
    .from("facilities")
    .select("id")
    .eq("name", spec.name)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }

  if (existing.data?.id) {
    const update = await admin
      .from("facilities")
      .update({
        type: spec.type,
        country: spec.country,
        gs1_company_prefix: spec.gs1CompanyPrefix,
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (update.error) {
      throw update.error;
    }

    return update.data.id;
  }

  const insert = await admin
    .from("facilities")
    .insert({
      name: spec.name,
      type: spec.type,
      country: spec.country,
      gs1_company_prefix: spec.gs1CompanyPrefix,
    })
    .select("id")
    .single();

  if (insert.error) {
    throw insert.error;
  }

  return insert.data.id;
}

async function ensureUser(
  spec: DemoUser,
  facilityId: string,
  facilityName: string,
): Promise<string> {
  let user = await findUserByEmail(spec.email);

  if (!user) {
    const createResponse = await admin.auth.admin.createUser({
      email: spec.email,
      password: demoPassword,
      email_confirm: true,
      app_metadata: {
        role: spec.role,
      },
      user_metadata: {
        display_name: spec.displayName,
        facility_name: facilityName,
      },
    });

    if (createResponse.error || !createResponse.data.user) {
      throw createResponse.error ?? new Error("Unable to create demo user.");
    }

    user = createResponse.data.user as User;
  } else {
    const updatePayload: Parameters<
      typeof admin.auth.admin.updateUserById
    >[1] = {};

    if (user.user_metadata?.display_name !== spec.displayName) {
      updatePayload.user_metadata = {
        ...user.user_metadata,
        display_name: spec.displayName,
        facility_name: facilityName,
      };
    }

    if (user.app_metadata?.role !== spec.role) {
      updatePayload.app_metadata = {
        ...user.app_metadata,
        role: spec.role,
      };
    }

    updatePayload.password = demoPassword;

    const updateResponse = await admin.auth.admin.updateUserById(
      user.id,
      updatePayload,
    );

    if (updateResponse.error) {
      throw updateResponse.error;
    }

    user = updateResponse.data.user as User;
  }

  const profileUpsert = await admin
    .from("users")
    .upsert(
      {
        id: user.id,
        email: spec.email.toLowerCase(),
        display_name: spec.displayName,
        facility_id: facilityId,
        role: spec.role,
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (profileUpsert.error) {
    throw profileUpsert.error;
  }

  return user.id;
}

async function ensureBatch(
  spec: DemoBatch,
  facilityIdMap: Map<FacilityKey, string>,
  userIdMap: Map<string, string>,
): Promise<string> {
  const ownerFacilityId = facilityIdMap.get(spec.currentOwner);
  if (!ownerFacilityId) {
    throw new Error(`Missing facility mapping for ${spec.currentOwner}`);
  }

  const creatorUserId = userIdMap.get(spec.createdBy);
  if (!creatorUserId) {
    throw new Error(`Missing user mapping for ${spec.createdBy}`);
  }

  const existing = await admin
    .from("batches")
    .select("id")
    .eq("gtin", spec.gtin)
    .eq("lot", spec.lot)
    .maybeSingle();

  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }

  const payload = {
    product_name: spec.productName,
    qty: spec.qty,
    expiry: spec.expiry,
    label_text: spec.labelText,
    topic_id: spec.topicId,
    current_owner_facility_id: ownerFacilityId,
    created_by_user_id: creatorUserId,
    created_at: spec.createdAt,
  };

  if (existing.data?.id) {
    const update = await admin
      .from("batches")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (update.error) {
      throw update.error;
    }

    return update.data.id;
  }

  const insert = await admin
    .from("batches")
    .insert({
      id: crypto.randomUUID(),
      product_name: spec.productName,
      gtin: spec.gtin,
      lot: spec.lot,
      expiry: spec.expiry,
      qty: spec.qty,
      label_text: spec.labelText,
      topic_id: spec.topicId,
      current_owner_facility_id: ownerFacilityId,
      created_by_user_id: creatorUserId,
      created_at: spec.createdAt,
    })
    .select("id")
    .single();

  if (insert.error) {
    throw insert.error;
  }

  return insert.data.id;
}

async function insertEvent(
  spec: DemoEvent,
  batchIdMap: Map<string, string>,
  facilityIdMap: Map<FacilityKey, string>,
  userIdMap: Map<string, string>,
  previousHashMap: Map<string, string>,
) {
  const batchId = batchIdMap.get(spec.batchKey);

  if (!batchId) {
    throw new Error(`Missing batch reference for ${spec.batchKey}`);
  }

  const batchSpec = batches.find((b) => b.key === spec.batchKey);

  if (!batchSpec) {
    throw new Error(`Missing batch spec for ${spec.batchKey}`);
  }

  const fromFacilityId = facilityIdMap.get(spec.fromFacility);
  if (!fromFacilityId) {
    throw new Error(`Missing facility mapping for ${spec.fromFacility}`);
  }

  const toFacilityId = spec.toFacility
    ? facilityIdMap.get(spec.toFacility) ?? null
    : null;

  const createdByUserId = userIdMap.get(spec.createdBy);
  if (!createdByUserId) {
    throw new Error(`Missing user mapping for ${spec.createdBy}`);
  }

  const payload = {
    v: 1,
    type: spec.type,
    batch: {
      gtin: batchSpec.gtin,
      lot: batchSpec.lot,
      exp: batchSpec.expiry,
    },
    actor: {
      facilityId: fromFacilityId,
      role: facilities.find((f) => f.key === spec.fromFacility)?.type ?? "",
    },
    to: spec.toFacility
      ? {
          facilityId: toFacilityId,
        }
      : null,
    ts: spec.timestamp,
    prev: previousHashMap.get(spec.batchKey) ?? null,
    meta: {
      memo: spec.memo,
    },
  };

  const message = JSON.stringify(payload);
  const payloadHash = sha256(message);
  const txSeconds = Math.floor(new Date(spec.timestamp).getTime() / 1000);
  const txNanos = (new Date(spec.timestamp).getTime() % 1000) * 1_000_000;
  const topicId = serverEnv.hederaTopicId ?? batchSpec.topicId;
  const hcsTxId = `${topicId}@${txSeconds}.${String(txNanos).padStart(
    9,
    "0",
  )}`;
  const running = runningHash(`${payloadHash}:${spec.sequence}`);

  const { error } = await admin.from("events").upsert(
    {
      batch_id: batchId,
      type: spec.type,
      from_facility_id: fromFacilityId,
      to_facility_id: toFacilityId,
      hcs_tx_id: hcsTxId,
      hcs_seq_no: spec.sequence,
      hcs_running_hash: running,
      payload_hash: payloadHash,
      created_by_user_id: createdByUserId,
      created_at: spec.timestamp,
    },
    { onConflict: "payload_hash" },
  );

  if (error) {
    throw error;
  }

  previousHashMap.set(spec.batchKey, payloadHash);
}

async function insertReceipt(
  spec: DemoReceipt,
  batchIdMap: Map<string, string>,
  facilityIdMap: Map<FacilityKey, string>,
) {
  const batchId = batchIdMap.get(spec.batchKey);

  if (!batchId) {
    throw new Error(`Missing batch reference for ${spec.batchKey}`);
  }

  const pharmacyId = facilityIdMap.get(spec.pharmacyFacility);
  if (!pharmacyId) {
    throw new Error(`Missing facility mapping for ${spec.pharmacyFacility}`);
  }

  const { error } = await admin.from("receipts").upsert(
    {
      batch_id: batchId,
      pharmacy_facility_id: pharmacyId,
      patient_ref: spec.patientRef,
      shortcode: spec.shortcode,
      status: "ACTIVE",
      created_at: spec.createdAt,
    },
    { onConflict: "shortcode" },
  );

  if (error) {
    throw error;
  }
}

async function main() {
  logStep("Seeding pack-trace demo data…");

  const facilityIdMap = new Map<FacilityKey, string>();
  for (const facility of facilities) {
    const id = await ensureFacility(facility);
    facilityIdMap.set(facility.key, id);
    logStep(`Facility ready: ${facility.name}`);
  }

  const userIdMap = new Map<string, string>();
  for (const user of users) {
    const facilityId = facilityIdMap.get(user.facility);

    if (!facilityId) {
      throw new Error(`Missing facility mapping for ${user.facility}`);
    }

    const facilityName =
      facilities.find((f) => f.key === user.facility)?.name ?? "";
    const userId = await ensureUser(user, facilityId, facilityName);
    userIdMap.set(user.key, userId);
    logStep(`User ready: ${user.email}`);
  }

  if (skipSampleData) {
    logStep(
      "Skipping sample batches, events, and receipts (DEMO_SEED_SKIP_SAMPLE_DATA=true).",
    );
    logStep(
      "Use the live workflow to create batches and push custody events to Hedera.",
    );
  } else {
    const batchIdMap = new Map<string, string>();
    for (const batch of batches) {
      const id = await ensureBatch(batch, facilityIdMap, userIdMap);
      batchIdMap.set(batch.key, id);
      logStep(`Batch ready: ${batch.productName} (${batch.lot})`);
    }

    const previousHashMap = new Map<string, string>();
    for (const event of events) {
      await insertEvent(
        event,
        batchIdMap,
        facilityIdMap,
        userIdMap,
        previousHashMap,
      );
      logStep(`Event recorded (${event.type}) for ${event.batchKey}`);
    }

    for (const receipt of receipts) {
      await insertReceipt(receipt, batchIdMap, facilityIdMap);
      logStep(`Receipt issued (${receipt.shortcode}) for ${receipt.batchKey}`);
    }
  }

  console.log("\nDemo access provisioned:");
  for (const user of users) {
    console.log(
      `  ${user.role.padEnd(6, " ")}  ${user.email} / ${demoPassword}`,
    );
  }

  console.log("\nDone. Launch the app and sign in with the credentials above.");
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
