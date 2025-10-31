"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { PublicVerifyState } from "@/lib/verify/public";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

type ChallengeState = {
  id: string;
  prompt: string;
};

type FetchStatus = "idle" | "loading" | "error" | "success";

const STATUS_META = {
  genuine: {
    label: "Genuine",
    icon: CheckCircle2,
    tone: "text-emerald-600",
    badge: "bg-emerald-500 text-white",
  },
  recalled: {
    label: "Recalled",
    icon: ShieldAlert,
    tone: "text-red-600",
    badge: "bg-red-500 text-white",
  },
  mismatch: {
    label: "Mismatch",
    icon: AlertCircle,
    tone: "text-amber-600",
    badge: "bg-amber-500 text-black",
  },
  unknown: {
    label: "Unknown",
    icon: AlertCircle,
    tone: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    tone: "text-destructive",
    badge: "bg-destructive text-destructive-foreground",
  },
  idle: {
    label: "Ready",
    icon: Loader2,
    tone: "text-muted-foreground",
    badge: "bg-primary text-primary-foreground",
  },
} as const;

function shortTopicId(topicId: string | null): string {
  if (!topicId) return "—";
  const segments = topicId.split(".");
  if (segments.length <= 2) return topicId;
  return `${segments.slice(0, 2).join(".")}.${segments.at(-1)}`;
}

function resolveStatusMeta(state: PublicVerifyState | null) {
  if (!state) return STATUS_META.idle;
  return STATUS_META[state.status] ?? STATUS_META.unknown;
}

export function PublicVerifyClient() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicVerifyState | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const statusMeta = useMemo(() => resolveStatusMeta(result), [result]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = code.trim();
      if (!trimmed) {
        setError("Enter or paste a GS1 DataMatrix payload to verify.");
        return;
      }

      setStatus("loading");
      setError(null);

      const params = new URLSearchParams();
      params.set("code", trimmed);
      if (challenge && captchaAnswer.trim()) {
        params.set("captchaId", challenge.id);
        params.set("captchaAnswer", captchaAnswer.trim());
      }

      try {
        const response = await fetch(`/api/verify/public?${params.toString()}`, {
          method: "GET",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              state?: PublicVerifyState;
              challenge?: ChallengeState;
            }
          | null;

        if (!response.ok || !payload?.state) {
          if (payload?.challenge) {
            setChallenge(payload.challenge);
            setCaptchaAnswer("");
            setStatus("error");
            setResult(null);
            setError(
              payload.error ??
                "Please solve the CAPTCHA challenge to continue verification.",
            );
            return;
          }

          throw new Error(
            payload?.error ?? "Verification failed. Try again shortly.",
          );
        }

        setChallenge(null);
        setCaptchaAnswer("");
        setResult(payload.state);
        setStatus("success");
      } catch (fetchError) {
        setStatus("error");
        setResult(null);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Verification failed. Try again shortly.",
        );
      }
    },
    [captchaAnswer, challenge, code],
  );

  const timeline = result?.timeline ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px),minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Verify a pack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="verify-code">GS1 payload</Label>
                <Textarea
                  id="verify-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Paste the GS1 string encoded in the DataMatrix"
                  rows={4}
                  required
                />
              </div>
              {challenge ? (
                <div className="space-y-2">
                  <Label htmlFor="verify-captcha">{challenge.prompt}</Label>
                  <Input
                    id="verify-captcha"
                    value={captchaAnswer}
                    onChange={(event) => setCaptchaAnswer(event.target.value)}
                    placeholder="Type your answer"
                    inputMode="numeric"
                  />
                </div>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify pack"
                )}
              </Button>
            </form>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs font-semibold", statusMeta.badge)}>
                {statusMeta.label}
              </Badge>
            </div>
            <CardTitle>Verification status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-sm", statusMeta.tone)}>
              {result?.message ??
                "Paste a GS1 DataMatrix payload to validate the pack against the custody timeline."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identifiers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">GTIN</p>
              <p className="font-mono text-sm">
                {result?.parsed?.gtin ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Lot</p>
              <p className="font-mono text-sm">{result?.parsed?.lot ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Expiry</p>
              <p className="font-mono text-sm">
                {result?.parsed?.expiry ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Serial</p>
              <p className="font-mono text-sm">
                {result?.parsed?.maskedSerial ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On-chain proof</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Hedera topic
                </p>
                <p className="text-sm font-semibold">
                  {shortTopicId(result?.topicId ?? null)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">
                  Latest sequence
                </p>
                <p className="text-sm font-semibold">
                  {result?.latestSequence !== null
                    ? `#${result?.latestSequence}`
                    : "—"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {result?.links.hashscanTopicUrl ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={result.links.hashscanTopicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on HashScan
                </a>
              ) : null}
              {result?.links.mirrorTopicUrl ? (
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={result.links.mirrorTopicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mirror Node feed
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custody timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Timeline entries will appear once Hedera messages matching the
                GTIN, lot, and expiry are detected.
              </p>
            ) : (
              <ol className="space-y-3 text-sm">
                {timeline.map((entry) => (
                  <li
                    key={entry.sequenceNumber}
                    className="flex items-center justify-between rounded border border-border/60 bg-muted/40 px-3 py-2"
                  >
                    <span className="font-semibold">
                      {entry.eventType}
                      <span className="text-muted-foreground">
                        {" "}
                        • {entry.actorLabel}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {entry.formattedTimestamp}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {result?.timelineNote ? (
              <Alert>
                <AlertDescription>{result.timelineNote}</AlertDescription>
              </Alert>
            ) : null}
            {result?.timelineError ? (
              <Alert variant="destructive">
                <AlertDescription>{result.timelineError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Need richer detail?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Operational timelines with facility names, custody actions, and
              receipt workflows remain available to authenticated teams inside
              the dashboard.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/scan">Open scanner</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
