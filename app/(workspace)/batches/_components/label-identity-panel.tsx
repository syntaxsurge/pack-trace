"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Copy,
  Download,
  ExternalLink,
  FileDown,
  Maximize2,
  Printer,
} from "lucide-react";

interface LabelIdentityPanelProps {
  labelText: string;
  batchId?: string;
  productName?: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  quantity?: number | null;
  facilityName?: string | null;
  note?: string | null;
  userRole?: string | null;
  onReprint?: () => void;
  printLabel?: string;
}

const ICON_SIZE = 16;

export function LabelIdentityPanel(props: LabelIdentityPanelProps) {
  const {
    labelText,
    batchId,
    productName,
    gtin,
    lot,
    expiry,
    quantity,
    facilityName,
    note,
    userRole,
    onReprint,
    printLabel = "Print",
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const getCanvasDataUrl = useCallback(() => {
    if (!canvasRef.current) return null;
    return canvasRef.current.toDataURL("image/png");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!canvasRef.current) {
        return;
      }

      try {
        const mod = await import("bwip-js/browser");
        if (cancelled || !canvasRef.current) {
          return;
        }

        mod.default.toCanvas(canvasRef.current, {
          bcid: "gs1datamatrix",
          text: labelText,
          scale: 6,
          paddingwidth: 2,
          paddingheight: 2,
          includetext: false,
          backgroundcolor: "FFFFFF",
        });

        setRenderError(null);
      } catch (error) {
        setRenderError(
          error instanceof Error
            ? error.message
            : "Unable to render GS1 DataMatrix.",
        );
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [labelText]);

  useEffect(() => {
    const handle = () => {
      setZoomImageUrl(getCanvasDataUrl());
      setIsZoomOpen(true);
    };

    window.addEventListener("label-identity:open", handle);
    return () => {
      window.removeEventListener("label-identity:open", handle);
    };
  }, [getCanvasDataUrl]);

  const withFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 2500);
  }, []);

  const handleCopyGs1 = useCallback(() => {
    if (!labelText) return;
    void navigator.clipboard
      .writeText(labelText)
      .then(() => withFeedback("GS1 string copied"))
      .catch(() => setFeedback("Copy failed"));
  }, [labelText, withFeedback]);

  const verifyUrl = useMemo(() => {
    if (!labelText) return "";
    const qs = new URLSearchParams({ code: labelText }).toString();
    return origin ? `${origin}/verify?${qs}` : `/verify?${qs}`;
  }, [labelText, origin]);

  const handleCopyVerifyLink = useCallback(() => {
    if (!verifyUrl) return;
    void navigator.clipboard
      .writeText(verifyUrl)
      .then(() => withFeedback("Verify link copied"))
      .catch(() => setFeedback("Copy failed"));
  }, [verifyUrl, withFeedback]);

  const handleDownloadPng = useCallback(() => {
    const dataUrl = getCanvasDataUrl();
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `pack-trace-label-${gtin}-${lot}.png`;
    link.click();
    withFeedback("PNG downloaded");
  }, [getCanvasDataUrl, gtin, lot, withFeedback]);

  const handlePrint = useCallback(() => {
    const dataUrl = getCanvasDataUrl();
    if (!dataUrl) return;

    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print label</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin: 24px;
      }
      img {
        width: 260px;
        height: 260px;
        image-rendering: pixelated;
      }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" alt="GS1 DataMatrix" />
    <script>
      window.onload = () => {
        window.print();
        window.close();
      };
    </script>
  </body>
</html>`);
    printWindow.document.close();
    withFeedback("Print window opened");
    onReprint?.();
  }, [getCanvasDataUrl, onReprint, withFeedback]);

  const handleDownloadPdf = useCallback(() => {
    if (!batchId) return;
    const link = document.createElement("a");
    link.href = `/api/batches/${batchId}/label`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
    withFeedback("PDF opened");
  }, [batchId, withFeedback]);

  const isPrintDisabled =
    userRole?.toUpperCase() === "AUDITOR" || !batchId || !!renderError;

  return (
    <div className="space-y-6 rounded-2xl border border-border/60 bg-background p-6 shadow-xl dark:bg-muted/40">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex w-full flex-col items-center gap-4 xl:max-w-xs">
          <div
            className={cn(
              "flex items-center justify-center rounded-xl border border-border/50 bg-white p-4 shadow-md transition hover:shadow-lg dark:bg-white",
              isZoomOpen ? "ring-2 ring-primary" : "",
            )}
          >
            <canvas
              ref={canvasRef}
              aria-label={`GS1 DataMatrix for ${labelText}`}
              role="img"
              className="h-56 w-56"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => {
                setZoomImageUrl(getCanvasDataUrl());
                setIsZoomOpen(true);
              }}
            >
              <Maximize2 size={ICON_SIZE} aria-hidden="true" />
              Zoom
            </Button>
            {batchId ? (
              <>
                <span aria-hidden="true">·</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    if (!batchId) return;
                    window.open(`/api/batches/${batchId}/label?format=png`, "_blank");
                  }}
                >
                  <ExternalLink size={ICON_SIZE} aria-hidden="true" />
                  Open PNG
                </Button>
              </>
            ) : null}
          </div>
          {renderError ? (
            <p className="text-xs text-destructive">{renderError}</p>
          ) : null}
        </div>

        <div className="flex-1 space-y-6 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoChip label="GTIN" value={gtin} emphasis />
            <InfoChip label="Lot" value={lot} />
            <InfoChip label="Expiry" value={expiry} />
            {productName ? (
              <InfoChip label="Product" value={productName} multiline />
            ) : null}
            {quantity !== undefined && quantity !== null ? (
              <InfoChip label="Quantity" value={String(quantity)} />
            ) : null}
            {facilityName ? (
              <InfoChip label="Facility" value={facilityName} multiline />
            ) : null}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick actions
            </h3>
            <div className="flex flex-wrap gap-2">
              <IdentityActionButton
                icon={<Printer size={ICON_SIZE} aria-hidden="true" />}
                label={printLabel}
                onClick={handlePrint}
                disabled={isPrintDisabled}
              />
              <IdentityActionButton
                icon={<FileDown size={ICON_SIZE} aria-hidden="true" />}
                label="Download PDF"
                onClick={handleDownloadPdf}
                disabled={!batchId}
              />
              <IdentityActionButton
                icon={<Download size={ICON_SIZE} aria-hidden="true" />}
                label="Download PNG"
                onClick={handleDownloadPng}
              />
              <IdentityActionButton
                icon={<Copy size={ICON_SIZE} aria-hidden="true" />}
                label="Copy GS1"
                onClick={handleCopyGs1}
              />
              <IdentityActionButton
                icon={<ExternalLink size={ICON_SIZE} aria-hidden="true" />}
                label="Copy verify link"
                onClick={handleCopyVerifyLink}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Raw GS1 string
            </h3>
            <pre className="max-h-32 overflow-auto rounded-xl border border-border/40 bg-muted/70 p-3 text-xs font-mono leading-relaxed text-foreground shadow-inner">
              {labelText}
            </pre>
          </div>

          {note ? (
            <p className="text-xs text-muted-foreground">{note}</p>
          ) : null}

          {feedback ? (
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
              {feedback}
            </div>
          ) : null}
        </div>
      </div>

      {isZoomOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex flex-col items-center gap-4 rounded-lg bg-white p-6 shadow-2xl dark:bg-background">
            <button
              type="button"
              className="absolute right-3 top-3 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setIsZoomOpen(false)}
            >
              Close
            </button>
            {zoomImageUrl ? (
              <img
                src={zoomImageUrl}
                alt={`GS1 DataMatrix for ${labelText}`}
                className="h-72 w-72 rounded border bg-white p-4"
              />
            ) : (
              <div className="flex h-72 w-72 items-center justify-center rounded border bg-muted">
                <span className="text-sm text-muted-foreground">Rendering…</span>
              </div>
            )}
            <p className="max-w-sm text-center text-xs text-muted-foreground">
              Scan directly from this screen or download the PNG for other devices.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LabelIdentityZoomTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("label-identity:open"))}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      Show code
    </button>
  );
}

interface InfoChipProps {
  label: string;
  value: string;
  emphasis?: boolean;
  multiline?: boolean;
}

function InfoChip({ label, value, emphasis, multiline }: InfoChipProps) {
  return (
    <div className="space-y-1 rounded-xl border border-border/40 bg-muted/30 p-3 text-left shadow-sm dark:bg-muted/50">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-medium text-foreground",
          emphasis && "text-base font-semibold tracking-tight text-primary",
          multiline ? "whitespace-normal break-words" : "truncate",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

interface IdentityActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function IdentityActionButton({
  icon,
  label,
  onClick,
  disabled,
}: IdentityActionButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="flex min-w-[160px] flex-1 items-center justify-between gap-3 rounded-lg border-border/50 bg-background px-4 py-3 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 sm:w-auto"
    >
      <span>{label}</span>
      <span className="text-muted-foreground">{icon}</span>
    </Button>
  );
}
