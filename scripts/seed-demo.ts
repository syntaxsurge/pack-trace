import "dotenv/config";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "../lib/supabase/admin";

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

const admin = createAdminClient();
const demoPassword =
  process.env.DEMO_SEED_PASSWORD && process.env.DEMO_SEED_PASSWORD.trim().length > 0
    ? process.env.DEMO_SEED_PASSWORD
    : "TraceDemo!24";

function logStep(message: string) {
  console.log(`▪️ ${message}`);
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

async function main() {
  logStep("Seeding pack-trace demo data…");

  const facilityIdMap = new Map<FacilityKey, string>();
  for (const facility of facilities) {
    const id = await ensureFacility(facility);
    facilityIdMap.set(facility.key, id);
    logStep(`Facility ready: ${facility.name}`);
  }

  for (const user of users) {
    const facilityId = facilityIdMap.get(user.facility);

    if (!facilityId) {
      throw new Error(`Missing facility mapping for ${user.facility}`);
    }

    const facilityName =
      facilities.find((f) => f.key === user.facility)?.name ?? "";
    await ensureUser(user, facilityId, facilityName);
    logStep(`User ready: ${user.email}`);
  }

  logStep(
    "Seeded facilities and user accounts. Create batches in-app to capture fresh Hedera events.",
  );

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
