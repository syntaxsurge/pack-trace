"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decodeImageBlob, useScanner } from "@/app/_hooks/useScanner";
import {
  parseGs1Datamatrix,
  type ParsedGs1Datamatrix,
} from "@/lib/labels/gs1";
import { buildHashscanMessageUrl } from "@/lib/hedera/links";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  ImageUp,
  Loader2,
  PencilLine,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

type CustodyEventType = "RECEIVED" | "HANDOVER" | "DISPENSED";

interface FacilitySummary {
  id: string;
  name: string | null;
  type: string | null;
}

interface FacilityDirectoryEntry extends FacilitySummary {
  country: string | null;
  gs1CompanyPrefix: string | null;
}

type FacilityDirectoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; facilities: FacilityDirectoryEntry[] };

interface BatchSummary {
  id: string;
  product_name: string | null;
  gtin: string;
  lot: string;
  expiry: string;
  qty: number;
  current_owner_facility_id: string | null;
  current_owner_facility: FacilitySummary | null;
  topic_id: string | null;
  created_at: string;
}

interface ScannerClientProps {
  userId: string;
  userRole: string;
  facility: FacilitySummary | null;
}

type BatchLookupState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "not-found"; key: string }
  | { status: "error"; key: string; message: string }
  | { status: "loaded"; key: string; batch: BatchSummary };

type ActionStatus =
  | { state: "idle" }
  | { state: "submitting"; action: CustodyEventType }
  | {
      state: "success";
      action: CustodyEventType;
      receipt: {
        id: string;
        hcs_tx_id: string;
        hcs_seq_no: number | null;
        hcs_running_hash: string | null;
        payload_hash: string;
      };
      hederaDelivered: boolean;
      warning?: string | null;
    }
  | { state: "error"; action: CustodyEventType; message: string };

type ScanMode = "camera" | "upload" | "paste" | "manual";

type ModeConfig = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const MODE_META: Record<ScanMode, ModeConfig> = {
  camera: {
    label: "Camera",
    description:
      "Use the live camera feed to decode GS1 DataMatrix labels in real time.",
    icon: Camera,
  },
  upload: {
    label: "Upload",
    description:
      "Drop or choose an image of the label. Decoding happens entirely in the browser.",
    icon: ImageUp,
  },
  paste: {
    label: "Paste",
    description:
      "Paste a screenshot or GS1 string from the clipboard. Images and text are both supported.",
    icon: ClipboardPaste,
  },
  manual: {
    label: "Manual",
    description:
      "Enter a GS1 Application Identifier string if scanning isn’t possible.",
    icon: PencilLine,
  },
};

const CLIENT_NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";
const CLIENT_TOPIC_ID = process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID ?? null;

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ScannerClient({
  userId,
  userRole,
  facility,
}: ScannerClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [scanPayload, setScanPayload] = useState<ParsedGs1Datamatrix | null>(
    null,
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionStatus>({
    state: "idle",
  });
  const [batchState, setBatchState] = useState<BatchLookupState>({
    status: "idle",
  });
  const [handoverFacilityId, setHandoverFacilityId] = useState("");
  const [facilityDirectory, setFacilityDirectory] =
    useState<FacilityDirectoryState>({
      status: "idle",
    });
  const [facilitySearch, setFacilitySearch] = useState("");
  const [directoryRefreshToken, setDirectoryRefreshToken] = useState(0);
  const [mode, setMode] = useState<ScanMode>("camera");
  const [lastSource, setLastSource] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [lastPastedText, setLastPastedText] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedFacilitySearch = facilitySearch.trim();
  const modeMeta = MODE_META[mode];
  const ModeIcon = modeMeta.icon;

  const {
    videoRef,
    status,
    permission,
    error,
    result,
    source,
    restart,
  } = useScanner({
    deDuplicationMs: 2000,
    enabled: mode === "camera",
  });

  const lookupBatch = useCallback(
    async (payload: ParsedGs1Datamatrix) => {
      const lookupKey = `${payload.gtin}:${payload.lot}:${payload.expiryIsoDate}`;
      setBatchState({ status: "loading", key: lookupKey });

      const { data, error: queryError } = await supabase
        .from("batches")
        .select(
          `
            id,
            product_name,
            gtin,
            lot,
            expiry,
            qty,
            current_owner_facility_id,
            topic_id,
            created_at,
            current_owner_facility:facilities!batches_current_owner_facility_id_fkey(
              id,
              name,
              type
            )
          `,
        )
        .eq("gtin", payload.gtin)
        .eq("lot", payload.lot)
        .maybeSingle();

      if (queryError && queryError.code !== "PGRST116") {
        setBatchState({
          status: "error",
          key: lookupKey,
          message: queryError.message,
        });
        return;
      }

      if (!data) {
        setBatchState({ status: "not-found", key: lookupKey });
        return;
      }

      const raw = data as Record<string, unknown>;
      const rawOwner = (raw as { current_owner_facility?: unknown })
        .current_owner_facility;

      let currentOwner: FacilitySummary | null = null;

      if (Array.isArray(rawOwner)) {
        const ownerCandidate = rawOwner[0] as Record<string, unknown> | undefined;
        if (ownerCandidate) {
          currentOwner = {
            id: String(ownerCandidate.id ?? ""),
            name: (ownerCandidate.name as string | null) ?? null,
            type: (ownerCandidate.type as string | null) ?? null,
          };
        }
      } else if (rawOwner && typeof rawOwner === "object") {
        const ownerCandidate = rawOwner as Record<string, unknown>;
        currentOwner = {
          id: String(ownerCandidate.id ?? ""),
          name: (ownerCandidate.name as string | null) ?? null,
          type: (ownerCandidate.type as string | null) ?? null,
        };
      }

      const batch: BatchSummary = {
        id: String(raw.id ?? ""),
        product_name: (raw.product_name as string | null) ?? null,
        gtin: String(raw.gtin ?? ""),
        lot: String(raw.lot ?? ""),
        expiry: String(raw.expiry ?? ""),
        qty: Number(raw.qty ?? 0),
        current_owner_facility_id:
          (raw.current_owner_facility_id as string | null) ?? null,
        current_owner_facility: currentOwner,
        topic_id: (raw.topic_id as string | null) ?? null,
        created_at: String(raw.created_at ?? ""),
      };

      setBatchState({
        status: "loaded",
        key: lookupKey,
        batch,
      });
    },
    [supabase],
  );

  const handleDecodedValue = useCallback(
    (rawValue: string, originLabel: string) => {
      try {
        const parsed = parseGs1Datamatrix(rawValue);
        setScanPayload(parsed);
        setPayloadError(null);
        setDecodeError(null);
        setLastSource(originLabel);
        setActionState({ state: "idle" });
        void lookupBatch(parsed);
      } catch (parseError) {
        setScanPayload(null);
        setBatchState({ status: "idle" });
        setLastSource(originLabel);
        setPayloadError(
          parseError instanceof Error
            ? parseError.message
            : "Failed to decode GS1 payload.",
        );
      }
    },
    [lookupBatch],
  );

  const decodeImage = useCallback(
    async (blob: Blob, origin: "upload" | "paste") => {
      setIsDecoding(true);
      setDecodeError(null);
      setPayloadError(null);

      try {
        const decoded = await decodeImageBlob(blob);

        if (!decoded) {
          setDecodeError(
            "No barcode was detected. Try a tighter crop, brighter lighting, or a higher-resolution image.",
          );
          return;
        }

        const originLabel =
          origin === "upload"
            ? decoded.source === "barcode-detector"
              ? "upload · BarcodeDetector"
              : "upload · ZXing"
            : decoded.source === "barcode-detector"
              ? "paste image · BarcodeDetector"
              : "paste image · ZXing";

        handleDecodedValue(decoded.rawValue, originLabel);
      } catch (decodeErr) {
        setDecodeError(
          decodeErr instanceof Error
            ? decodeErr.message
            : "Failed to decode the provided image.",
        );
      } finally {
        setIsDecoding(false);
      }
    },
    [handleDecodedValue],
  );

  const handleModeSelect = useCallback((nextMode: ScanMode) => {
    setMode(nextMode);
    setDecodeError(null);
    setDragActive(false);
    if (nextMode !== "paste") {
      setLastPastedText(null);
    }
    if (nextMode !== "manual") {
      setManualInput("");
    }
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setLastPastedText(null);
      void decodeImage(file, "upload");
      // Allow selecting the same file again.
      event.target.value = "";
    },
    [decodeImage],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        setLastPastedText(null);
        void decodeImage(file, "upload");
      }
    },
    [decodeImage],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleManualSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = manualInput.trim();
      if (!trimmed) {
        setPayloadError("Enter a GS1 string before decoding.");
        return;
      }

      setDecodeError(null);
      setLastPastedText(trimmed);
      handleDecodedValue(trimmed, "manual entry");
    },
    [handleDecodedValue, manualInput],
  );

  useEffect(() => {
    if (!result?.rawValue) {
      return;
    }

    const originLabel =
      result.source === "barcode-detector"
        ? "camera · BarcodeDetector"
        : "camera · ZXing";

    handleDecodedValue(result.rawValue, originLabel);
  }, [handleDecodedValue, result]);

  useEffect(() => {
    if (mode !== "paste") {
      return;
    }

    const handlePasteEvent = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;

      if (!clipboardData) {
        return;
      }

      const items = clipboardData.items;
      let handled = false;

      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            handled = true;
            event.preventDefault();
            setLastPastedText(null);
            void decodeImage(file, "paste");
            break;
          }
        }
      }

      if (handled) {
        return;
      }

      const text = clipboardData.getData("text");
      const trimmed = text?.trim();

      if (trimmed) {
        handled = true;
        event.preventDefault();
        setLastPastedText(trimmed);
        setDecodeError(null);
        setPayloadError(null);
        handleDecodedValue(trimmed, "paste text");
      }

      if (!handled) {
        setDecodeError(
          "Clipboard did not contain an image or GS1 string. Copy the label image or encoded text before pasting.",
        );
      }
    };

    window.addEventListener("paste", handlePasteEvent);

    return () => {
      window.removeEventListener("paste", handlePasteEvent);
    };
  }, [decodeImage, handleDecodedValue, mode]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function loadDirectory() {
      setFacilityDirectory({ status: "loading" });

      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("includeSelf", "false");
      if (normalizedFacilitySearch) {
        params.set("q", normalizedFacilitySearch);
      }

      try {
        const response = await fetch(`/api/facilities?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              facilities?: FacilityDirectoryEntry[];
              error?: string;
            }
          | null;

        if (!response.ok) {
          const message =
            payload?.error ?? "Failed to load facility directory.";
          throw new Error(message);
        }

        if (!isActive) {
          return;
        }

        const facilities = Array.isArray(payload?.facilities)
          ? payload?.facilities ?? []
          : [];

        setFacilityDirectory({
          status: "ready",
          facilities,
        });
      } catch (directoryError) {
        if (!isActive || controller.signal.aborted) {
          return;
        }
        setFacilityDirectory({
          status: "error",
          message:
            directoryError instanceof Error
              ? directoryError.message
              : "Failed to load facility directory.",
        });
      }
    }

    void loadDirectory();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [facility?.id, directoryRefreshToken, normalizedFacilitySearch]);

  const handleAction = useCallback(
    async (actionType: CustodyEventType) => {
      if (!scanPayload) {
        return;
      }

      if (!facility?.id) {
        setActionState({
          state: "error",
          action: actionType,
          message: "Assign a facility to your profile before logging events.",
        });
        return;
      }

      if (actionType === "HANDOVER" && !handoverFacilityId) {
        setActionState({
          state: "error",
          action: actionType,
          message: "Enter the destination facility ID to hand over custody.",
        });
        return;
      }

      setActionState({ state: "submitting", action: actionType });

      try {
        const response = await fetch("/api/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchId:
              batchState.status === "loaded" ? batchState.batch.id : undefined,
            gs1: {
              gtin: scanPayload.gtin14,
              lot: scanPayload.lot,
              expiryIsoDate: scanPayload.expiryIsoDate,
            },
            type: actionType,
            toFacilityId:
              actionType === "HANDOVER" ? handoverFacilityId : undefined,
            metadata: {
              scannerSource: lastSource ?? source ?? null,
              inputMode: mode,
              scannedAt: new Date().toISOString(),
            },
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              event: {
                id: string;
                hcs_tx_id: string;
                hcs_seq_no: number | null;
                hcs_running_hash: string | null;
                payload_hash: string;
              };
              hederaDelivered?: boolean;
              warning?: string | null;
            }
          | { error?: string }
          | null;

        if (!response.ok || !payload || !('event' in payload)) {
          const message =
            (payload as { error?: string } | null)?.error ??
            `Failed to record ${formatStatus(actionType)}.`;
          throw new Error(message);
        }

        const successPayload = payload as {
          event: {
            id: string;
            hcs_tx_id: string;
            hcs_seq_no: number | null;
            hcs_running_hash: string | null;
            payload_hash: string;
          };
          hederaDelivered?: boolean;
          warning?: string | null;
        };

        setActionState({
          state: "success",
          action: actionType,
          receipt: successPayload.event,
          hederaDelivered: successPayload.hederaDelivered ?? false,
          warning: successPayload.warning,
        });

        if (actionType === "HANDOVER") {
          setHandoverFacilityId("");
          setFacilitySearch("");
        }

        // Refresh batch snapshot to reflect updated ownership.
        void lookupBatch(scanPayload);
      } catch (submitError) {
        setActionState({
          state: "error",
          action: actionType,
          message:
            submitError instanceof Error
              ? submitError.message
              : `Failed to record ${formatStatus(actionType)}.`,
        });
      }
    },
    [
      batchState,
      facility?.id,
      handoverFacilityId,
      lastSource,
      lookupBatch,
      mode,
      scanPayload,
      source,
    ],
  );

  const isSubmitting =
    actionState.state === "submitting" ? actionState.action : null;

  const reloadFacilityDirectory = useCallback(() => {
    setDirectoryRefreshToken((token) => token + 1);
  }, []);

  const filteredFacilities = useMemo(() => {
    if (facilityDirectory.status !== "ready") {
      return [];
    }

    const normalized = facilitySearch.trim().toLowerCase();

    if (!normalized) {
      return facilityDirectory.facilities;
    }

    return facilityDirectory.facilities.filter((entry) => {
      const haystack = [
        entry.name ?? "",
        entry.type ?? "",
        entry.country ?? "",
        entry.gs1CompanyPrefix ?? "",
        entry.id,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [facilityDirectory, facilitySearch]);

  const selectedFacility = useMemo(() => {
    if (facilityDirectory.status !== "ready" || !handoverFacilityId) {
      return null;
    }

    return (
      facilityDirectory.facilities.find(
        (entry) => entry.id === handoverFacilityId,
      ) ?? null
    );
  }, [facilityDirectory, handoverFacilityId]);

  const isFacilityDirectoryLoading = facilityDirectory.status === "loading";

  return (
    <div className="flex flex-col gap-8 pb-12">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Scan GS1 DataMatrix codes
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose between the live camera, image upload, clipboard paste, or
          manual entry. The camera mode prioritises the rear lens, tries
          BarcodeDetector first, and falls back to ZXing when needed. All modes
          parse GTIN, lot, and expiry locally before looking up the batch for
          custody actions.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ModeIcon className="h-4 w-4" aria-hidden="true" />
                {modeMeta.label} scan
              </CardTitle>
              <CardDescription className="text-xs">
                {modeMeta.description}
              </CardDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                {(Object.entries(MODE_META) as Array<[ScanMode, ModeConfig]>).map(
                  ([key, config]) => {
                    const Icon = config.icon;
                    const isActive = mode === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleModeSelect(key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-transparent bg-muted text-muted-foreground hover:border-primary/30 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {config.label}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {mode === "camera" ? status : mode}
              </Badge>
              {lastSource ? (
                <Badge variant="secondary" className="capitalize">
                  {lastSource}
                </Badge>
              ) : null}
              {mode === "camera" ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={restart}
                  aria-label="Restart scanner"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {mode === "camera" ? (
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg border bg-black">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                {error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center text-sm text-red-100">
                    <ShieldAlert className="h-9 w-9" aria-hidden="true" />
                    <p className="font-medium">Scanner error</p>
                    <p className="text-xs text-red-100/80">{error}</p>
                  </div>
                ) : null}
                {permission === "denied" && !error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center text-sm text-red-100">
                    <ShieldAlert className="h-9 w-9" aria-hidden="true" />
                    <p className="font-medium">Camera permission denied</p>
                    <p className="text-xs text-red-100/80">
                      Update browser settings to re-enable camera access, then
                      restart the scanner.
                    </p>
                  </div>
                ) : null}
                {mode === "camera" && !result && !error && permission !== "granted" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-6 text-center text-sm text-white">
                    <p className="font-medium">Allow camera access</p>
                    <p className="text-xs text-white/80">
                      Choose the rear camera for best results. Your feed stays on
                      device—only decoded codes leave the browser.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {mode === "upload" ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center text-sm transition",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 bg-muted/10",
                )}
              >
                <ImageUp
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium text-foreground">
                  Drop an image or browse from files
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or HEIC up to 10&nbsp;MB. Decoding stays on-device.
                </p>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDecoding}
                >
                  {isDecoding ? (
                    <>
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Decoding…
                    </>
                  ) : (
                    "Choose image"
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : null}
            {mode === "paste" ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm">
                <ClipboardPaste
                  className="h-6 w-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium text-foreground">
                  Paste an image or GS1 string
                </p>
                <p className="text-xs text-muted-foreground">
                  Use ⌘V / Ctrl+V while this tab is active. Images never leave the browser.
                </p>
                {lastPastedText ? (
                  <div className="w-full overflow-hidden rounded bg-muted px-3 py-2 text-left text-xs font-mono">
                    <span className="block truncate">{lastPastedText}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Clipboard content will appear here after you paste.
                  </p>
                )}
              </div>
            ) : null}
            {mode === "manual" ? (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="manual-code"
                    className="text-xs font-semibold uppercase text-muted-foreground"
                  >
                    GS1 string
                  </Label>
                  <Input
                    id="manual-code"
                    name="manual-code"
                    placeholder="(01)09506000134352(10)LOT123(17)251231"
                    value={manualInput}
                    onChange={(event) => setManualInput(event.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Include Application Identifiers such as (01), (10), and (17).
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!manualInput.trim()}>
                    Decode
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setManualInput("");
                      setPayloadError(null);
                      setDecodeError(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            ) : null}
            {isDecoding && mode !== "camera" ? (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Decoding…
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                GS1 payload
              </CardTitle>
              <CardDescription className="text-xs">
                Raw scan decoded into GTIN, lot, and expiry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {payloadError ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Unable to parse GS1 data</p>
                    <p className="text-xs text-destructive/80">{payloadError}</p>
                  </div>
                </div>
              ) : null}
              {decodeError ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Unable to read the image</p>
                    <p className="text-xs text-amber-700/80">{decodeError}</p>
                  </div>
                </div>
              ) : null}
              {scanPayload ? (
                <dl className="grid gap-3 text-sm">
                  <div className="grid gap-1">
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      GTIN
                    </dt>
                    <dd className="font-mono text-sm">{scanPayload.gtin14}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Lot
                    </dt>
                    <dd className="font-mono text-sm">{scanPayload.lot}</dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Expiry
                    </dt>
                    <dd className="font-mono text-sm">
                      {scanPayload.expiryIsoDate}
                    </dd>
                  </div>
                  <div className="grid gap-1">
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Raw
                    </dt>
                    <dd className="truncate font-mono text-xs">
                      {scanPayload.raw}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Scan a label to populate the GS1 payload.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Batch lookup
              </CardTitle>
              <CardDescription className="text-xs">
                Matches the scanned GTIN + lot against tracked batches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {batchState.status === "loading" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Fetching batch details…
                </div>
              ) : null}
              {batchState.status === "error" ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{batchState.message}</div>
                </div>
              ) : null}
              {batchState.status === "not-found" ? (
                <p className="text-xs text-muted-foreground">
                  No batch was found for this GTIN and lot. Create it from the{" "}
                  <Link className="underline" href="/batches/new">
                    batch registration form
                  </Link>{" "}
                  before logging custody events.
                </p>
              ) : null}
              {batchState.status === "loaded" ? (
                <dl className="grid gap-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Product
                    </dt>
                    <dd>{batchState.batch.product_name ?? "Unnamed batch"}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="font-semibold uppercase text-muted-foreground">
                        Quantity
                      </dt>
                      <dd>{batchState.batch.qty}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold uppercase text-muted-foreground">
                        Expires
                      </dt>
                      <dd>{formatDate(batchState.batch.expiry)}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Current owner
                    </dt>
                    <dd className="flex flex-col gap-1">
                      <span className="text-sm">
                        {batchState.batch.current_owner_facility?.name ??
                          "Unassigned"}
                      </span>
                      {batchState.batch.current_owner_facility ? (
                        <Badge variant="outline" className="w-fit text-[10px]">
                          {batchState.batch.current_owner_facility.type}
                        </Badge>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Custody actions
          </CardTitle>
          <CardDescription className="text-xs">
            Log the next custody hop. Updates are persisted immediately and, if
            Hedera credentials are configured, mirrored to the Consensus Service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <ActionTile
              title="Receive"
              description="Confirm the pack arrived at your facility."
              action="RECEIVED"
              onClick={handleAction}
              disabled={!scanPayload || isSubmitting === "RECEIVED"}
              loading={isSubmitting === "RECEIVED"}
            />
            <ActionTile
              title="Handover"
              description="Transfer custody to another facility."
              action="HANDOVER"
              onClick={handleAction}
              disabled={
                !scanPayload ||
                isSubmitting === "HANDOVER" ||
                !handoverFacilityId
              }
              loading={isSubmitting === "HANDOVER"}
            />
            <ActionTile
              title="Dispense"
              description="Mark the pack as dispensed to a patient."
              action="DISPENSED"
              onClick={handleAction}
              disabled={!scanPayload || isSubmitting === "DISPENSED"}
              loading={isSubmitting === "DISPENSED"}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="handover-search">Destination facility</Label>
              <div className="grid gap-2">
                <Input
                  id="handover-search"
                  value={facilitySearch}
                  onChange={(event) => setFacilitySearch(event.target.value)}
                  placeholder="Search by name, GS1 prefix, country, or facility ID"
                  autoComplete="off"
                  disabled={isFacilityDirectoryLoading}
                  aria-describedby="handover-help"
                />
                <div className="rounded-lg border border-muted">
                  {isFacilityDirectoryLoading ? (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      Loading facility directory…
                    </div>
                  ) : null}
                  {facilityDirectory.status === "error" ? (
                    <div className="flex items-start gap-3 p-3 text-xs text-destructive">
                      <span>{facilityDirectory.message}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={reloadFacilityDirectory}
                        disabled={isFacilityDirectoryLoading}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : null}
                  {facilityDirectory.status === "ready" ? (
                    filteredFacilities.length > 0 ? (
                      <ul className="max-h-48 divide-y divide-border overflow-y-auto text-xs">
                        {filteredFacilities.map((entry) => {
                          const isSelected = handoverFacilityId === entry.id;
                          return (
                            <li key={entry.id}>
                              <button
                                type="button"
                                onClick={() => setHandoverFacilityId(entry.id)}
                                className={cn(
                                  "flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                  isSelected
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-muted",
                                )}
                                aria-pressed={isSelected}
                              >
                                <span className="text-sm font-medium">
                                  {entry.name ?? "Unnamed facility"}
                                </span>
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {entry.type ?? "UNKNOWN"}
                                  {entry.gs1CompanyPrefix
                                    ? ` • ${entry.gs1CompanyPrefix}`
                                    : ""}
                                  {entry.country ? ` • ${entry.country}` : ""}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {entry.id}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="p-3 text-xs text-muted-foreground">
                        No facilities match this search. Adjust filters or paste
                        an ID directly below.
                      </div>
                    )
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="handover-facility" className="sr-only">
                  Selected facility ID
                </Label>
                <Input
                  id="handover-facility"
                  value={handoverFacilityId}
                  onChange={(event) => setHandoverFacilityId(event.target.value)}
                  placeholder="Selected facility ID or paste a custom UUID"
                  autoComplete="off"
                  aria-describedby="handover-help"
                />
                <p className="text-xs text-muted-foreground" id="handover-help">
                  Required for handovers. Choose from the directory or paste a
                  verified facility UUID.
                </p>
              </div>
              {selectedFacility ? (
                <div className="rounded-md border border-primary/50 bg-primary/5 p-3 text-xs">
                  <p className="font-medium text-primary">
                    {selectedFacility.name ?? "Unnamed facility"}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-primary/80">
                    {selectedFacility.type ?? "UNKNOWN"}
                    {selectedFacility.gs1CompanyPrefix
                      ? ` • ${selectedFacility.gs1CompanyPrefix}`
                      : ""}
                    {selectedFacility.country
                      ? ` • ${selectedFacility.country}`
                      : ""}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-primary/70">
                    {selectedFacility.id}
                  </p>
                </div>
              ) : handoverFacilityId ? (
                <div className="rounded-md border border-muted p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Custom facility ID
                  </p>
                  <p className="font-mono text-[11px]">{handoverFacilityId}</p>
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-muted p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                Current operator context
              </p>
              <dl className="mt-2 grid gap-1">
                <div className="flex justify-between">
                  <dt>User</dt>
                  <dd className="font-mono text-[11px]">{userId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Role</dt>
                  <dd className="uppercase">{userRole}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Facility</dt>
                  <dd className="text-right">
                    {facility?.name ?? "Unassigned"}
                    {facility?.type ? (
                      <span className="ml-2 inline-flex items-center rounded border border-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {facility.type}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {actionState.state === "idle" ? (
            <p className="text-xs text-muted-foreground">
              Actions are available once a batch is identified from a scan.
            </p>
          ) : null}
          {actionState.state === "submitting" ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Recording {formatStatus(actionState.action)} event…
            </div>
          ) : null}
          {actionState.state === "success" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Event recorded.</span>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 font-mono text-emerald-800">
                      Seq {actionState.receipt.hcs_seq_no ?? "pending"}
                    </span>
                    {actionState.receipt.hcs_tx_id ? (
                      <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 font-mono text-emerald-800">
                        {actionState.receipt.hcs_tx_id}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono">
                  <span className="text-muted-foreground">Hash</span>
                  <span className="break-all text-emerald-800">
                    {actionState.receipt.payload_hash}
                  </span>
                </div>
                {actionState.receipt.hcs_running_hash ? (
                  <div className="flex flex-col gap-1 text-[11px] font-mono">
                    <span className="text-muted-foreground">Running hash</span>
                    <span className="break-all text-emerald-800">
                      {actionState.receipt.hcs_running_hash}
                    </span>
                  </div>
                ) : null}
                {actionState.hederaDelivered &&
                actionState.receipt.hcs_seq_no !== null &&
                ((batchState.status === "loaded" && batchState.batch.topic_id) ||
                  CLIENT_TOPIC_ID) ? (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="text-muted-foreground">Explorer</span>
                    <a
                      href={buildHashscanMessageUrl(
                        CLIENT_NETWORK,
                        (batchState.status === "loaded" && batchState.batch.topic_id
                          ? batchState.batch.topic_id
                          : CLIENT_TOPIC_ID) ?? "",
                        actionState.receipt.hcs_seq_no,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 underline-offset-4 hover:underline"
                    >
                      View on Hashscan
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </div>
              {!actionState.hederaDelivered ? (
                <div className="flex items-start gap-2 text-amber-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Hedera submission unavailable. Event stored locally—configure
                    HEDERA_OPERATOR_ACCOUNT_ID, HEDERA_OPERATOR_DER_PRIVATE_KEY, and
                    HEDERA_TOPIC_ID to resume ledger replication.
                  </span>
                </div>
              ) : null}
              {actionState.warning ? (
                <div className="flex items-start gap-2 text-amber-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{actionState.warning}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {actionState.state === "error" ? (
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{actionState.message}</span>
            </div>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}

interface ActionTileProps {
  title: string;
  description: string;
  action: CustodyEventType;
  disabled?: boolean;
  loading?: boolean;
  onClick: (action: CustodyEventType) => void;
}

function ActionTile({
  title,
  description,
  action,
  disabled,
  loading,
  onClick,
}: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      disabled={disabled}
      className={cn(
        "flex h-full flex-col justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        "hover:border-primary hover:bg-primary/5",
      )}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs font-medium">
        <span className="uppercase text-muted-foreground">
          {formatStatus(action)}
        </span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">↗</span>
        )}
      </div>
    </button>
  );
}
