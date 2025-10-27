"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Camera, Loader2, RefreshCw } from "lucide-react";

import { useScanner } from "@/app/_hooks/useScanner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { VerifyState } from "./types";

interface VerifyClientProps {
  state: VerifyState;
}

function formatScannerStatus(status: string) {
  switch (status) {
    case "initializing":
      return "Initialising camera...";
    case "ready":
      return "Camera ready. Position the code within the frame.";
    case "scanning":
      return "Scanning for DataMatrix patterns...";
    case "error":
      return "Scanner error. Try restarting or use manual entry.";
    case "idle":
    default:
      return "Scanner idle.";
  }
}

function normalizeCode(value: string): string {
  return value.trim();
}

export function VerifyClient({ state }: VerifyClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [manualCode, setManualCode] = useState(() => state.code ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setManualCode(state.code ?? "");
    setSubmitting(false);
  }, [state.code]);

  const applyCode = useCallback(
    (nextCode: string) => {
      const trimmed = normalizeCode(nextCode);

      if (!trimmed) {
        router.push(pathname);
        return;
      }

      const params = new URLSearchParams();
      params.set("code", trimmed);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = normalizeCode(manualCode);
      if (!trimmed) {
        applyCode(trimmed);
        setSubmitting(false);
        return;
      }
      setSubmitting(true);
      applyCode(trimmed);
    },
    [applyCode, manualCode],
  );

  const handleClear = useCallback(() => {
    setManualCode("");
    router.push(pathname);
  }, [pathname, router]);

  const {
    videoRef,
    status: scannerStatus,
    permission,
    error,
    result,
    source,
    restart,
  } = useScanner({
    deDuplicationMs: 2500,
    onScan: (scan) => {
      applyCode(scan.rawValue);
    },
  });

  const scannerMessage = useMemo(
    () => formatScannerStatus(scannerStatus),
    [scannerStatus],
  );

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="manual-code">GS1 DataMatrix payload</Label>
          <textarea
            id="manual-code"
            name="manual-code"
            rows={3}
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="(01)09506000134352(10)A123(17)251231"
          />
          <p className="text-xs text-muted-foreground">
            Paste the exact string encoded in the DataMatrix label, including
            parentheses or group separators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={submitting || normalizeCode(manualCode).length === 0}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Check code
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              normalizeCode(manualCode).length === 0 && (state.code ?? "") === ""
            }
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4" />
            Camera scanner
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={restart}
          >
            <RefreshCw className="h-4 w-4" />
            Restart
          </Button>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          <div className="absolute inset-4 rounded-md border-2 border-white/50" />
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-xs text-white">
            {scannerStatus === "scanning" ? "Scanning…" : "Standby"}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {scannerMessage}
          {permission === "denied"
            ? " Camera permission denied. Enable camera access in your browser settings."
            : null}
        </div>
        {result ? (
          <div className="rounded border border-primary/40 bg-primary/10 p-2 text-xs text-primary">
            Last scan: {result.rawValue.slice(0, 80)}
            {result.rawValue.length > 80 ? "…" : ""} via{" "}
            {(source ?? "detector").replace(/-/g, " ")}
          </div>
        ) : null}
        {error ? (
          <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
