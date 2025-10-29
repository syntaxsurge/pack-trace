import { redirect } from "next/navigation";

import { BatchForm } from "@/app/(workspace)/batches/new/_components/batch-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function NewBatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profileResponse = await supabase
    .from("users")
    .select("facility_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    throw new Error(profileResponse.error.message);
  }

  const facilityId = profileResponse.data?.facility_id ?? null;

  if (!facilityId) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Create batch</h1>
          <p className="text-muted-foreground">
            Assign your user to a facility in Supabase before registering
            batches.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Facility required</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              We could not find an associated facility for your account. Ask an
              administrator to assign you to a facility, then reload this page
              to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const facilityResponse = await supabase
    .from("facilities")
    .select("name")
    .eq("id", facilityId)
    .maybeSingle();

  if (facilityResponse.error) {
    throw new Error(facilityResponse.error.message);
  }

  const facilityName = facilityResponse.data?.name ?? "assigned facility";

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create batch</h1>
        <p className="text-muted-foreground">
          Register new product lots, generate GS1 DataMatrix labels, and publish
          manufacturing events from a single workspace.
        </p>
      </header>

      <BatchForm facilityName={facilityName} />
    </div>
  );
}
