import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  description: "pack-trace works offline with cached dashboards and scanner context.",
};

export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 py-12 text-center text-slate-100">
      <div className="max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          You&apos;re offline.
        </h1>
        <p className="text-base leading-relaxed text-slate-300">
          Recent packs, custody events, and verification data are cached locally.
          When you regain connectivity, refresh to sync the latest Hedera updates
          and Supabase records.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/scan"
          className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Resume scanning
        </Link>
        <Link
          href="/"
          className="rounded-full border border-slate-700 px-6 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-200"
        >
          Go home
        </Link>
      </div>
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        pack-trace PWA
      </p>
    </main>
  );
}
