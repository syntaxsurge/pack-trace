"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { parseGs1Datamatrix, type ParsedGs1Datamatrix } from "@/lib/labels/gs1";
import { PublicVerifyState } from "@/lib/verify/public";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Gs1Scanner, type ScanMode } from "@/components/verify/gs1-scanner";
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

function maskSerialValue(serial: string | null): string | null {
  if (!serial) return null;
  const normalized = serial.trim();
  if (!normalized) return null;
  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }
  const tail = normalized.slice(-4);
  return `${"*".repeat(normalized.length - 4)}${tail}`;
}

export function PublicVerifyClient() {
  const [scanPayload, setScanPayload] = useState<ParsedGs1Datamatrix | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicVerifyState | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<ScanMode>("camera");
  const [lastSource, setLastSource] = useState<string | null>(null);

  const statusMeta = useMemo(() => resolveStatusMeta(result), [result]);

  const badgeMeta = useMemo(() => {
    if (status === "loading") {
      return {
        label: "Verifying",
        icon: Loader2,
        tone: "text-muted-foreground",
        badge: "bg-primary text-primary-foreground",
      };
    }
    if (status === "error" && !result) {
      return STATUS_META.error;
    }
    return statusMeta;
  }, [result, status, statusMeta]);

  const performVerify = useCallback(
    async (rawCode: string, options?: { captchaId?: string; captchaAnswer?: string }) => {
      const params = new URLSearchParams();
      params.set("code", rawCode);
      if (options?.captchaId) {
        params.set("captchaId", options.captchaId);
        params.set("captchaAnswer", options.captchaAnswer ?? "");
      }

      try {
        const response = await fetch(`/api/verify/public?${params.toString()}`);
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
            setStatus("error");
            setResult(null);
            setError(
              payload.error ?? "Please solve the CAPTCHA challenge to continue verification.",
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
        setError(null);
      } catch (verifyError) {
        setStatus("error");
        setResult(null);
        setError(
          verifyError instanceof Error
            ? verifyError.message
            : "Verification failed. Try again shortly.",
        );
      }
    },
    [],
  );

  const handleDecoded = useCallback(
    (rawValue: string, context: { mode: ScanMode; origin: string }) => {
      setLastMode(context.mode);
      setLastSource(context.origin);
      setChallenge(null);
      setCaptchaAnswer("");
      try {
        const parsed = parseGs1Datamatrix(rawValue);
        setScanPayload(parsed);
        setPayloadError(null);
        setDecodeError(null);
        setStatus("loading");
        setError(null);
        setResult(null);
        setLastCode(rawValue);
        void performVerify(rawValue);
      } catch (parseError) {
        setScanPayload(null);
        setResult(null);
        setLastCode(null);
        const message =
          parseError instanceof Error
            ? parseError.message
            : "Failed to decode GS1 payload.";
        setStatus("error");
        setError(message);
        setPayloadError(message);
      }
    },
    [performVerify],
  );

  const handleDecodeError = useCallback((message: string | null) => {
    setDecodeError(message);
    if (message) {
      setStatus("error");
      setResult(null);
      setScanPayload(null);
      setLastCode(null);
      setError(message);
    }
  }, []);

  const handleClearScan = useCallback(() => {
    setScanPayload(null);
    setPayloadError(null);
    setDecodeError(null);
    setResult(null);
    setStatus("idle");
    setError(null);
    setChallenge(null);
    setCaptchaAnswer("");
    setLastCode(null);
    setLastSource(null);
  }, []);

  const handleChallengeSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!challenge || !lastCode) {
        return;
      }
      const trimmed = captchaAnswer.trim();
      if (!trimmed) {
        setError("Enter the answer to continue verification.");
        return;
      }
      setStatus("loading");
      setError(null);
      await performVerify(lastCode, {
        captchaId: challenge.id,
        captchaAnswer: trimmed,
      });
    },
    [captchaAnswer, challenge, lastCode, performVerify],
  );

  const timeline = result?.timeline ?? [];

  const identifiers = result?.parsed
    ? result.parsed
    : scanPayload
    ? {
        gtin: scanPayload.gtin14,
        lot: scanPayload.lot,
        expiry: scanPayload.expiryIsoDate,
        maskedSerial: maskSerialValue(scanPayload.serial),
      }
    : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px),minmax(0,1fr)]">
      <div className="space-y-6">
        <Gs1Scanner
          onDecoded={handleDecoded}
          onDecodeError={handleDecodeError}
          onModeChange={setLastMode}
          onClear={handleClearScan}
        />
        {decodeError ? (
          <Alert variant="destructive">
            <AlertDescription>{decodeError}</AlertDescription>
          </Alert>
        ) : null}
        {payloadError ? (
          <Alert variant="destructive">
            <AlertDescription>{payloadError}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className={cn("text-xs font-semibold", badgeMeta.badge)}>
                {badgeMeta.label}
              </Badge>
            </div>
            <CardTitle>Verification status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "idle" ? (
              <p className="text-sm text-muted-foreground">
                Scan a GS1 DataMatrix to validate the pack against the custody timeline.
              </p>
            ) : null}
            {status === "loading" ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verifying code…
              </div>
            ) : null}
            {status !== "loading" && result?.message ? (
              <p className={cn("text-sm", badgeMeta.tone)}>{result.message}</p>
            ) : null}
            {status !== "loading" && error && !result?.message ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {challenge ? (
              <form onSubmit={handleChallengeSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="verify-captcha">{challenge.prompt}</Label>
                  <Input
                    id="verify-captcha"
                    value={captchaAnswer}
                    onChange={(event) => setCaptchaAnswer(event.target.value)}
                    placeholder="Type your answer"
                    inputMode="numeric"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={status === "loading"}>
                    Submit answer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setChallenge(null);
                      setCaptchaAnswer("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
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
              <p className="font-mono text-sm">{identifiers?.gtin ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Lot</p>
              <p className="font-mono text-sm">{identifiers?.lot ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Expiry</p>
              <p className="font-mono text-sm">{identifiers?.expiry ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Serial</p>
              <p className="font-mono text-sm">{identifiers?.maskedSerial ?? "—"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase text-muted-foreground">Raw</p>
              <p className="font-mono text-xs">
                {scanPayload?.raw ?? lastCode ?? "—"}
              </p>
            </div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              <p>Scan mode: {lastMode}</p>
              {lastSource ? <p>Source: {lastSource}</p> : null}
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
                <p className="text-xs uppercase text-muted-foreground">Hedera topic</p>
                <p className="text-sm font-semibold">
                  {shortTopicId(result?.topicId ?? null)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Latest sequence</p>
                <p className="text-sm font-semibold">
                  {result?.latestSequence !== null ? `#${result?.latestSequence}` : "—"}
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
                Timeline entries will appear once Hedera messages matching the GTIN, lot, and expiry are detected.
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
                      <span className="text-muted-foreground"> • {entry.actorLabel}</span>
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
              Operational timelines with facility names, custody actions, and receipt workflows remain available to authenticated teams inside the dashboard.
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
