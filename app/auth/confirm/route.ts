import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") ? requestedNext : "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      redirect(nextPath as Route);
    } else {
      // redirect the user to an error page with some instructions
      redirect(
        `/auth/error?error=${encodeURIComponent(error?.message ?? "Unknown error")}` as Route,
      );
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No%20token%20hash%20or%20type` as Route);
}
