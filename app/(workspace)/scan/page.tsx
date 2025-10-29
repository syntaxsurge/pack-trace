import { redirect } from "next/navigation";

import { ScannerClient } from "./scanner-client";
import { createClient } from "@/lib/supabase/server";

interface FacilitySummary {
  id: string;
  name: string | null;
  type: string | null;
}

interface Profile {
  id: string;
  role: string;
  facility_id: string | null;
}

export default async function ScanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profileResponse = await supabase
    .from("users")
    .select("id, role, facility_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error && profileResponse.error.code !== "PGRST116") {
    throw new Error(profileResponse.error.message);
  }

  const profile = (profileResponse.data as Profile | null) ?? null;

  let facility: FacilitySummary | null = null;

  if (profile?.facility_id) {
    const facilityResponse = await supabase
      .from("facilities")
      .select("id, name, type")
      .eq("id", profile.facility_id)
      .maybeSingle();

    if (facilityResponse.error && facilityResponse.error.code !== "PGRST116") {
      throw new Error(facilityResponse.error.message);
    }

    facility = (facilityResponse.data as FacilitySummary | null) ?? null;
  }

  return (
    <ScannerClient
      userId={user.id}
      userRole={profile?.role ?? "UNKNOWN"}
      facility={facility}
    />
  );
}
