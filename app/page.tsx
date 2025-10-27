import Link from "next/link";

import { AuthButton } from "@/components/auth-button";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  FileText,
  QrCode,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

const featureCards = [
  {
    title: "Ledger-backed handovers",
    description:
      "Append every custody event to Hedera Consensus Service with deterministic payload hashing and running hash validation.",
    icon: RadioTower,
    href: "https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message",
  },
  {
    title: "GS1-compliant labels",
    description:
      "Encode GTIN, lot, and expiry into a GS1 DataMatrix that scanners can read on web, PWA, or native wrappers.",
    icon: QrCode,
    href: "https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf",
  },
  {
    title: "Role-aware access",
    description:
      "Supabase row-level security scopes data to the facility while auditors retain full read visibility across entities.",
    icon: ShieldCheck,
    href: "https://supabase.com/docs/guides/auth/row-level-security",
  },
];

const architecture = [
  {
    label: "Frontend",
    value:
      "Next.js App Router, Tailwind UI, PWA-ready scanner hooks with BarcodeDetector and ZXing fallbacks.",
    href: "https://nextjs.org/docs/app",
  },
  {
    label: "Backend",
    value:
      "Supabase Postgres + Auth for OTP and password flows, typed route handlers, and storage-backed label assets.",
    href: "https://supabase.com/docs/guides/getting-started/quickstarts/nextjs",
  },
  {
    label: "DLT layer",
    value:
      "Hedera Consensus Service topics mirror every event with mirror node reads for auditors and patient verification.",
    href: "https://docs.hedera.com/hedera/sdks-and-apis/rest-api/topics",
  },
];

const flows = [
  {
    title: "Create batch",
    body:
      "Manufacturers register GTIN, lot, expiry, and quantity, generate print-ready labels, and broadcast a MANUFACTURED event.",
  },
  {
    title: "Custody handover",
    body:
      "Distributors scan the GS1 DataMatrix to validate provenance, then append RECEIVED and HANDOVER events with the next facility ID.",
  },
  {
    title: "Dispense & verify",
    body:
      "Pharmacies issue receipts, patients confirm authenticity via public verify pages, and auditors export Hedera-backed PDF reports.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight sm:text-lg"
            aria-label="pack-trace landing page"
          >
            pack-trace
          </Link>
          <nav className="hidden gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a className="transition-colors hover:text-foreground" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-foreground" href="#architecture">
              Architecture
            </a>
            <a className="transition-colors hover:text-foreground" href="#flows">
              Flows
            </a>
          </nav>
          <AuthButton />
        </div>
      </header>

      <section className="border-b bg-muted/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Pack-level provenance
          </span>
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Trace every custody hop with Hedera-backed confidence.
            </h1>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              pack-trace unifies GS1-compliant labeling, Hedera Consensus Service
              logging, and Supabase-enforced access control so you can prove
              authenticity for every sealed pack in under two seconds.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                Get started
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#architecture">See architecture</a>
            </Button>
          </div>
          <dl className="grid w-full gap-6 text-left sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GS1 DataMatrix ready
              </dt>
              <dd className="mt-2 text-xl font-semibold">(01)(10)(17) schema</dd>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hedera finality
              </dt>
              <dd className="mt-2 text-xl font-semibold">&lt; 5s per event</dd>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Supabase guardrails
              </dt>
              <dd className="mt-2 text-xl font-semibold">Facility-scoped RLS</dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="space-y-4 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for regulated custody chains
          </h2>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            Each capability is wired to official specs so your compliance
            checklist, developer playbook, and on-site operations stay in sync.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {featureCards.map(({ title, description, icon: Icon, href }) => (
            <a
              key={title}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col gap-4 rounded-xl border bg-background p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              <span className="mt-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary opacity-0 transition group-hover:opacity-100">
                View reference
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section
        id="architecture"
        className="border-y bg-muted/20 py-16"
        aria-labelledby="architecture-heading"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
          <div className="space-y-4 text-center">
            <h2 id="architecture-heading" className="text-2xl font-semibold">
              Architecture snapshot
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
              The system splits responsibilities across presentation, custody
              orchestration, and distributed ledger persistence for clean
              layering and auditability.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {architecture.map(({ label, value, href }) => (
              <div key={label} className="rounded-xl border bg-background p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {label}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {value}
                </p>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  Reference
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="flows" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              End-to-end flows
            </h2>
            <p className="text-sm text-muted-foreground">
              Day-one delivers the critical batch onboarding and custody chains;
              subsequent sprints extend scanning, verification, and reporting.
            </p>
            <ol className="space-y-4 text-sm leading-6">
              {flows.map((flow, index) => (
                <li key={flow.title} className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{flow.title}</h3>
                  <p className="mt-2 text-muted-foreground">{flow.body}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4 rounded-xl border bg-background p-6">
            <h3 className="text-lg font-semibold">What&apos;s live today</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                • Supabase schema with facility and role-based row level
                security policies.
              </li>
              <li>
                • Authenticated dashboard summarizing batches, events, and
                facility metadata.
              </li>
              <li>
                • Production-ready auth flows for sign in, invites, and
                password recovery.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t bg-muted/20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-10 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} pack-trace. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <Link className="hover:underline" href="/login">
              Sign in
            </Link>
            <a
              className="hover:underline"
              href="https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message"
              target="_blank"
              rel="noreferrer"
            >
              Hedera tutorial
            </a>
            <a
              className="hover:underline"
              href="https://github.com/metafloor/bwip-js"
              target="_blank"
              rel="noreferrer"
            >
              bwip-js
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
