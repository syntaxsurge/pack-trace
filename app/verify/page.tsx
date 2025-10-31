import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PublicVerifyClient } from "./public-verify-client";

export const metadata = {
  title: "Verify pack | pack-trace",
  description:
    "Verify a GS1 DataMatrix payload against the Hedera custody timeline without exposing operational data.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function PublicVerifyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <PageHeader
          title="Public verification"
          description="Validate a pack’s GS1 identifiers with Hedera-backed custody events. Sensitive facility data stays behind login."
          icon={ShieldCheck}
        />
        <PublicVerifyClient />
      </section>
    </main>
  );
}
