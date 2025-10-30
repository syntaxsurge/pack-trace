import { redirect } from "next/navigation";

import { BatchForm } from "@/app/(workspace)/batches/new/_components/batch-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Package, AlertCircle } from "lucide-react";

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
      <div className="space-y-8">
        <PageHeader
          title="Create Batch"
          description="Register new product lots and generate GS1 DataMatrix labels"
          icon={Package}
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong className="font-semibold">Facility Required</strong>
            <p className="mt-2">
              We could not find an associated facility for your account. Ask an
              administrator to assign you to a facility, then reload this page
              to continue.
            </p>
          </AlertDescription>
        </Alert>
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
      <PageHeader
        title="Create Batch"
        description="Register new product lots, generate GS1 DataMatrix labels, and publish manufacturing events from a single workspace."
        icon={Package}
      />

      <BatchForm facilityName={facilityName} />
    </div>
  );
}
