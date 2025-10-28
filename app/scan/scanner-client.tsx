"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useScanner } from "@/app/_hooks/useScanner";
import {
  parseGs1Datamatrix,
  type ParsedGs1Datamatrix,
} from "@/lib/labels/gs1";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
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
  const normalizedFacilitySearch = facilitySearch.trim();

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

  useEffect(() => {
    if (!result?.rawValue) {
      return;
    }

    try {
      const parsed = parseGs1Datamatrix(result.rawValue);
      setScanPayload(parsed);
      setPayloadError(null);
      setActionState({ state: "idle" });
      void lookupBatch(parsed);
    } catch (parseError) {
      setScanPayload(null);
      setBatchState({ status: "idle" });
      setPayloadError(
        parseError instanceof Error
          ? parseError.message
          : "Failed to decode GS1 payload.",
      );
    }
  }, [lookupBatch, result]);

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
              scannerSource: source,
              scannedAt: new Date().toISOString(),
            },
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error ?? `Failed to record ${formatStatus(actionType)}.`;
          throw new Error(message);
        }

        const payload = (await response.json()) as {
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
          receipt: payload.event,
          hederaDelivered: payload.hederaDelivered ?? false,
          warning: payload.warning,
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
      lookupBatch,
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-12">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Scan GS1 DataMatrix codes
        </h1>
        <p className="text-sm text-muted-foreground">
          Position the label inside the frame. pack-trace prefers the device&apos;s
          rear camera, attempts BarcodeDetector first, and falls back to ZXing
          when required. Successful scans parse GTIN, lot, and expiry, then look
          up the batch for immediate custody actions.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Camera className="h-4 w-4" aria-hidden="true" />
                Live scanner
              </CardTitle>
              <CardDescription className="text-xs">
                {permission === "denied"
                  ? "Camera access denied. Update your browser permissions and restart."
                  : "Allow camera access to begin decoding GS1 DataMatrix labels."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {status}
              </Badge>
              {source ? (
                <Badge variant="secondary" className="capitalize">
                  {source}
                </Badge>
              ) : null}
              <Button
                size="icon"
                variant="outline"
                onClick={restart}
                aria-label="Restart scanner"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
              {!result && !error && permission !== "granted" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-6 text-center text-sm text-white">
                  <p className="font-medium">Allow camera access</p>
                  <p className="text-xs text-white/80">
                    Choose the rear camera for best results. Your feed stays on
                    device—only decoded codes leave the browser.
                  </p>
                </div>
              ) : null}
            </div>
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
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>
                  Event recorded (sequence{" "}
                  {actionState.receipt.hcs_seq_no ?? "pending"}).
                </span>
                <code className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                  {actionState.receipt.payload_hash.slice(0, 12)}…
                </code>
              </div>
              {!actionState.hederaDelivered ? (
                <div className="flex items-start gap-2 text-amber-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Hedera submission unavailable. Event stored locally—configure
                    HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, and HEDERA_TOPIC_ID to
                    resume ledger replication.
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
