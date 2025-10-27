import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { Button } from "./ui/button";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden sm:inline text-muted-foreground">
        Signed in as
      </span>
      <span className="font-medium">{user.email}</span>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard">Dashboard</Link>
      </Button>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}
