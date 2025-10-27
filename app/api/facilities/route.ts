import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

interface FacilityRecord {
  id: string;
  name: string;
  type: string;
  country: string | null;
  gs1_company_prefix: string | null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const profileResponse = await supabase
    .from("users")
    .select("facility_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    return NextResponse.json(
      { error: profileResponse.error.message },
      { status: 400 },
    );
  }

  const profile = profileResponse.data as
    | { facility_id: string | null; role: string }
    | null;

  if (!profile) {
    return NextResponse.json(
      { error: "User profile not found." },
      { status: 404 },
    );
  }

  const isAuditor = profile.role === "AUDITOR";

  if (!isAuditor && !profile.facility_id) {
    return NextResponse.json(
      {
        error:
          "Assign this account to a facility before requesting the directory.",
      },
      { status: 409 },
    );
  }

  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("q")?.trim() ?? "";
  const includeSelf = url.searchParams.get("includeSelf") === "true";

  let limitValue = DEFAULT_LIMIT;
  const requestedLimit = url.searchParams.get("limit");

  if (requestedLimit) {
    const parsedLimit = Number.parseInt(requestedLimit, 10);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      limitValue = Math.min(parsedLimit, MAX_LIMIT);
    }
  }

  let query = admin
    .from("facilities")
    .select(
      "id, name, type, country, gs1_company_prefix",
    )
    .order("name", { ascending: true })
    .limit(limitValue);

  if (searchTerm) {
    const escaped = searchTerm.replace(/[%_]/g, (char) => `\\${char}`);
    const likeQuery = `%${escaped}%`;
    query = query.or(
      [
        `name.ilike.${likeQuery}`,
        `gs1_company_prefix.ilike.${likeQuery}`,
        `country.ilike.${likeQuery}`,
        `id.ilike.${likeQuery}`,
      ].join(","),
    );
  }

  if (!includeSelf && profile.facility_id) {
    query = query.neq("id", profile.facility_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const facilities = (data ?? []).map((row) => {
    const facility = row as FacilityRecord;

    return {
      id: facility.id,
      name: facility.name,
      type: facility.type,
      country: facility.country,
      gs1CompanyPrefix: facility.gs1_company_prefix,
    };
  });

  return NextResponse.json({
    facilities,
  });
}
