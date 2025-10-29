import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";

export async function AuthButton() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/auth/sign-up">Create account</Link>
        </Button>
      </div>
    );
  }

  const email =
    user.email ??
    (typeof user.user_metadata?.email === "string"
      ? user.user_metadata.email
      : "Signed in user");

  return <UserMenu email={email} />;
}
