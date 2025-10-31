"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  Camera,
  ClipboardPaste,
  ImageUp,
  Loader2,
  PencilLine,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { decodeImageBlob, useScanner } from "@/app/_hooks/useScanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ScanMode = "camera" | "upload" | "paste" | "manual";

type ModeConfig = {
  label: string;
  description: string;
  icon: typeof Camera;
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

const CAMERA_EMIT_DEDUP_MS = 1_500;

interface Gs1ScannerProps {
  onDecoded: (rawValue: string, context: { mode: ScanMode; origin: string }) => void;
  onDecodeError?: (message: string | null) => void;
  onModeChange?: (mode: ScanMode) => void;
  onClear?: () => void;
  className?: string;
}

export function Gs1Scanner({
  onDecoded,
  onDecodeError,
  onModeChange,
  onClear,
  className,
}: Gs1ScannerProps) {
  const [mode, setMode] = useState<ScanMode>("camera");
  const [lastSource, setLastSource] = useState<string | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lastPastedText, setLastPastedText] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastCameraValueRef = useRef<{ signature: string; timestamp: number } | null>(
    null,
  );

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

  const handleModeSelect = useCallback(
    (nextMode: ScanMode) => {
      setMode(nextMode);
      onModeChange?.(nextMode);
      onDecodeError?.(null);
      setDragActive(false);
      if (nextMode !== "camera") {
        lastCameraValueRef.current = null;
      }
      if (nextMode !== "paste") {
        setLastPastedText(null);
      }
      if (nextMode !== "manual") {
        setManualInput("");
      }
    },
    [onDecodeError, onModeChange],
  );

  const emitDecoded = useCallback(
    (rawValue: string, originLabel: string, overrideMode?: ScanMode) => {
      onDecodeError?.(null);
      setLastSource(originLabel);
      const effectiveMode = overrideMode ?? mode;
      onDecoded(rawValue, { mode: effectiveMode, origin: originLabel });
    },
    [mode, onDecoded, onDecodeError],
  );

  const decodeImage = useCallback(
    async (blob: Blob, origin: "upload" | "paste") => {
      setIsDecoding(true);
      onDecodeError?.(null);
      try {
        const decoded = await decodeImageBlob(blob);
        if (!decoded) {
          onDecodeError?.(
            "No barcode detected. Try brighter lighting, sharper focus, or a tighter crop.",
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

        emitDecoded(decoded.rawValue, originLabel, mode);
      } catch (decodeError) {
        onDecodeError?.(
          decodeError instanceof Error
            ? decodeError.message
            : "Failed to decode the provided image.",
        );
      } finally {
        setIsDecoding(false);
      }
    },
    [emitDecoded, mode, onDecodeError],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setLastPastedText(null);
      void decodeImage(file, "upload");
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
        onDecodeError?.("Enter a GS1 string before decoding.");
        return;
      }

      setLastPastedText(trimmed);
      emitDecoded(trimmed, "manual entry", "manual");
    },
    [emitDecoded, manualInput, onDecodeError],
  );

  useEffect(() => {
    if (!result?.rawValue || mode !== "camera") {
      return;
    }

    const signature = `${source ?? "unknown"}:${result.rawValue}`;
    const now = Date.now();
    const last = lastCameraValueRef.current;

    if (last && last.signature === signature && now - last.timestamp < CAMERA_EMIT_DEDUP_MS) {
      return;
    }

    lastCameraValueRef.current = { signature, timestamp: now };

    const originLabel =
      source === "barcode-detector"
        ? "camera · BarcodeDetector"
        : "camera · ZXing";

    emitDecoded(result.rawValue, originLabel, "camera");
  }, [emitDecoded, mode, result?.rawValue, source]);

  useEffect(() => {
    if (mode !== "paste") {
      return;
    }

    const handlePasteEvent = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const { items } = clipboardData;
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

      if (!handled) {
        const text = clipboardData.getData("text/plain");
        if (text) {
          handled = true;
          event.preventDefault();
          setLastPastedText(text);
          emitDecoded(text, "paste text", "paste");
        }
      }
    };

    window.addEventListener("paste", handlePasteEvent);
    return () => window.removeEventListener("paste", handlePasteEvent);
  }, [decodeImage, emitDecoded, mode]);

  return (
    <Card className={cn("overflow-hidden border-2", className)}>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            {(() => {
              const Icon = MODE_META[mode].icon;
              return <Icon className="h-4 w-4" aria-hidden="true" />;
            })()}
            {MODE_META[mode].label} scan
          </CardTitle>
          <CardDescription className="text-xs">
            {MODE_META[mode].description}
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
              onClick={() => {
                lastCameraValueRef.current = null;
                restart();
              }}
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
                  Update browser settings to re-enable camera access, then restart the scanner.
                </p>
              </div>
            ) : null}
            {mode === "camera" && !result && !error && permission !== "granted" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-6 text-center text-sm text-white">
                <p className="font-medium">Allow camera access</p>
                <p className="text-xs text-white/80">
                  Choose the rear camera for best results. Your feed stays on device—only decoded codes leave the browser.
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
            <ImageUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium text-foreground">Drop an image or browse from files</p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or HEIC up to 10&nbsp;MB. Decoding stays on-device.
            </p>
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isDecoding}>
              {isDecoding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
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
            <ClipboardPaste className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium text-foreground">Paste an image or GS1 string</p>
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
                onChange={(event) => {
                  setManualInput(event.target.value);
                  onDecodeError?.(null);
                }}
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
                  onDecodeError?.(null);
                  onClear?.();
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
