import Image from "next/image";
import Link from "next/link";

import { AuthButton } from "@/components/auth-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, FileText, QrCode, RadioTower, ShieldCheck, CheckCircle2, Truck, ShoppingBag, Sparkles } from "lucide-react";

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
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg"
            aria-label="pack-trace landing page"
          >
            <Image
              src="/images/pack-trace-logo.png"
              alt="pack-trace logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-md"
              priority
            />
            <span className="hidden sm:inline">pack-trace</span>
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a className="transition-colors hover:text-primary" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-primary" href="#architecture">
              Architecture
            </a>
            <a className="transition-colors hover:text-primary" href="#flows">
              Flows
            </a>
          </nav>
          <AuthButton />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background" />
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-6 py-20 text-center lg:py-28">
          <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/10 px-4 py-1.5">
            <Sparkles className="h-3 w-3" />
            Pack-level Provenance for Pharmaceuticals
          </Badge>

          <div className="space-y-6">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              Trace every custody hop with{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Hedera proofs &amp; supOS live ops
              </span>
            </h1>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground sm:text-xl">
              Unify GS1-compliant labeling, Hedera Consensus Service notarisation, a
              supOS Unified Namespace, and Supabase-enforced access control so custody,
              telemetry, and operators stay in lockstep from manufacturing through
              dispense.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link href="/login">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <a href="#architecture">View Architecture</a>
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid w-full gap-6 pt-8 sm:grid-cols-3">
            <Card className="border-2">
              <CardContent className="flex flex-col items-center p-6">
                <div className="rounded-full bg-primary/10 p-3 mb-3">
                  <QrCode className="h-6 w-6 text-primary" />
                </div>
                <dt className="text-sm font-medium text-muted-foreground">
                  GS1 DataMatrix ready
                </dt>
                <dd className="mt-2 text-2xl font-bold tracking-tight">(01)(10)(17) schema</dd>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardContent className="flex flex-col items-center p-6">
                <div className="rounded-full bg-accent/10 p-3 mb-3">
                  <RadioTower className="h-6 w-6 text-accent" />
                </div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Hedera finality
                </dt>
                <dd className="mt-2 text-2xl font-bold tracking-tight">&lt; 5s per event</dd>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardContent className="flex flex-col items-center p-6">
                <div className="rounded-full bg-success/10 p-3 mb-3">
                  <ShieldCheck className="h-6 w-6 text-success" />
                </div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Supabase guardrails
                </dt>
                <dd className="mt-2 text-2xl font-bold tracking-tight">Facility-scoped RLS</dd>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto w-full max-w-7xl px-6 py-20">
        <div className="space-y-4 text-center">
          <Badge variant="secondary" className="mb-2">Features</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for regulated custody chains
          </h2>
          <p className="mx-auto max-w-3xl text-base text-muted-foreground sm:text-lg">
            Each capability is wired to official specs so your compliance
            checklist, developer playbook, and on-site operations stay in sync.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {featureCards.map(({ title, description, icon: Icon, href }) => (
            <Card
              key={title}
              className="group relative overflow-hidden border-2 transition-all hover:-translate-y-2 hover:shadow-2xl"
            >
              <a href={href} target="_blank" rel="noreferrer" className="block">
                <CardHeader>
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-xl">{title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-all group-hover:gap-3">
                    View reference
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </CardContent>
              </a>
            </Card>
          ))}
        </div>
      </section>

      {/* Architecture Section */}
      <section
        id="architecture"
        className="border-y bg-gradient-to-br from-muted/30 to-muted/10 py-20"
        aria-labelledby="architecture-heading"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-6">
          <div className="space-y-4 text-center">
            <Badge variant="secondary" className="mb-2">Architecture</Badge>
            <h2 id="architecture-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
              Architecture snapshot
            </h2>
            <p className="mx-auto max-w-3xl text-base text-muted-foreground sm:text-lg">
              The system splits responsibilities across presentation, custody
              orchestration, and distributed ledger persistence for clean
              layering and auditability.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {architecture.map(({ label, value, href }) => (
              <Card key={label} className="border-2 bg-background">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <div className="rounded-md bg-primary/10 p-1.5">
                      <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                    </div>
                    {label}
                  </div>
                  <CardDescription className="text-sm leading-relaxed text-foreground">
                    {value}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
                  >
                    View Reference
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Flows Section */}
      <section id="flows" className="mx-auto w-full max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div>
              <Badge variant="secondary" className="mb-2">User Flows</Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                End-to-end flows
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                Day-one delivers the critical batch onboarding and custody chains;
                subsequent sprints extend scanning, verification, and reporting.
              </p>
            </div>
            <div className="space-y-6">
              {flows.map((flow, index) => {
                const icons = [Package, Truck, ShoppingBag]
                const FlowIcon = icons[index]
                return (
                  <Card key={flow.title} className="border-l-4 border-l-primary">
                    <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                      <div className="rounded-lg bg-primary/10 p-2.5">
                        <FlowIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">Step {index + 1}</Badge>
                        </div>
                        <CardTitle className="text-lg">{flow.title}</CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {flow.body}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>
          </div>
          <Card className="border-2 bg-gradient-to-br from-primary/5 to-accent/5 h-fit sticky top-20">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-md bg-success/10 p-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <Badge variant="outline" className="text-success border-success/20">Live</Badge>
              </div>
              <CardTitle>What&apos;s available today</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Supabase schema with facility and role-based row level security policies
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Authenticated dashboard summarizing batches, events, and facility metadata
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Production-ready auth flows for sign in, invites, and password recovery
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gradient-to-br from-muted/30 to-muted/10">
        <div className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Image
                  src="/images/pack-trace-logo.png"
                  alt="pack-trace logo"
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-md"
                />
                <span className="text-lg font-bold">pack-trace</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Pack-level provenance for pharmaceuticals using Hedera blockchain
                and GS1 standards.
              </p>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#architecture" className="hover:text-primary transition-colors">
                    Architecture
                  </a>
                </li>
                <li>
                  <a href="#flows" className="hover:text-primary transition-colors">
                    Flows
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold">Resources</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a
                    href="https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    Hedera Tutorial
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.gs1.org/docs/barcodes/GS1_DataMatrix_Guideline.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    GS1 DataMatrix
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/metafloor/bwip-js"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    bwip-js Library
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold">Get Started</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link href="/login" className="hover:text-primary transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/auth/sign-up" className="hover:text-primary transition-colors">
                    Create Account
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="hover:text-primary transition-colors">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t pt-8 flex flex-col items-center justify-between gap-4 text-center text-sm text-muted-foreground sm:flex-row">
            <p>&copy; {new Date().getFullYear()} pack-trace. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-primary transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-primary transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
