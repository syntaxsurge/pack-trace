import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      title="Authentication interrupted"
      description="We couldn&apos;t complete the requested action."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {params?.error
              ? params.error
              : "An unexpected error occurred while processing your request."}
          </p>
          <Button asChild className="w-full" variant="outline" size="sm">
            <Link href="/login">Return to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
