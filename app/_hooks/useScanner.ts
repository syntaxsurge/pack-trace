"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScannerSource = "barcode-detector" | "zxing";

type BarcodeDetectorResult = {
  rawValue: string;
  format?: string;
};

interface BarcodeDetectorInstance {
  detect: (
    source: HTMLVideoElement | CanvasImageSource | ImageBitmap,
  ) => Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}

export type ScannerStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "scanning"
  | "error";

export type ScannerPermission = "unknown" | "prompt" | "granted" | "denied";

export interface ScanResult {
  rawValue: string;
  format: string;
  source: ScannerSource;
  timestamp: number;
}

export interface UseScannerOptions {
  /** Whether the scanner should attempt to activate the camera. */
  enabled?: boolean;
  /** When false the scanner stops after the first successful decode. */
  continuous?: boolean;
  /** Additional media constraints merged with the defaults. */
  constraints?: MediaTrackConstraints;
  /** Minimum time between identical decoded values before re-emitting, in ms. */
  deDuplicationMs?: number;
  /** Optional callback invoked whenever a new code is decoded. */
  onScan?: (result: ScanResult) => void;
}

const DEFAULT_DEDUP_MS = 1500;
const FACING_MODE: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
};

const ZXING_NOT_FOUND_ERROR = "NotFoundException";

type ReaderControls = import("@zxing/browser").IScannerControls;

export async function supportsBarcodeDetector(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const Detector = (window as typeof window & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;

  if (!Detector) {
    return false;
  }

  try {
    if (typeof Detector.getSupportedFormats === "function") {
      const formats = await Detector.getSupportedFormats();
      return formats.includes("data_matrix") || formats.includes("qr_code");
    }

    // Older implementations do not expose getSupportedFormats.
    // Try constructing a detector with GS1-friendly formats.
    const probe = new Detector({ formats: ["data_matrix", "qr_code"] });
    void probe;
    return true;
  } catch {
    return false;
  }
}

function buildConstraints(
  extra?: MediaTrackConstraints,
): MediaTrackConstraints {
  return {
    ...FACING_MODE,
    ...extra,
  };
}

export function useScanner(options: UseScannerOptions = {}) {
  const {
    enabled = true,
    continuous = true,
    constraints,
    deDuplicationMs = DEFAULT_DEDUP_MS,
    onScan,
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const readerControlsRef = useRef<ReaderControls | null>(null);
  const lastValueRef = useRef<string | null>(null);
  const lastTimestampRef = useRef<number>(0);

  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [permission, setPermission] = useState<ScannerPermission>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [source, setSource] = useState<ScannerSource | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();

    readerControlsRef.current?.stop();
    readerControlsRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStatus("idle");
  }, [clearTimers]);

  const restart = useCallback(() => {
    stop();
    setError(null);
    setResult(null);
    setSource(null);
    lastValueRef.current = null;
    lastTimestampRef.current = 0;
    setRestartToken((token) => token + 1);
  }, [stop]);

  const emitResult = useCallback(
    (next: ScanResult) => {
      const now = Date.now();

      if (
        lastValueRef.current === next.rawValue &&
        now - lastTimestampRef.current < deDuplicationMs
      ) {
        return;
      }

      lastValueRef.current = next.rawValue;
      lastTimestampRef.current = now;

      setResult(next);
      onScan?.(next);
    },
    [deDuplicationMs, onScan],
  );

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    let cancelled = false;

    async function initialiseScanner() {
      const videoElement = videoRef.current;

      if (!videoElement) {
        return;
      }

      setStatus("initializing");
      setError(null);
      setPermission("prompt");

      const barcodeDetectorAvailable = await supportsBarcodeDetector();

      if (cancelled) {
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: buildConstraints(constraints),
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        setPermission("granted");

        videoElement.playsInline = true;
        videoElement.setAttribute("muted", "true");
        videoElement.muted = true;
        videoElement.srcObject = mediaStream;

        await videoElement.play().catch(() => Promise.resolve());

        if (cancelled) {
          return;
        }

        if (barcodeDetectorAvailable) {
          setSource("barcode-detector");
          setStatus("scanning");

          const Detector = (window as typeof window & {
            BarcodeDetector?: BarcodeDetectorConstructor;
          }).BarcodeDetector;

          if (!Detector) {
            throw new Error("BarcodeDetector API became unavailable.");
          }

          const detector: BarcodeDetectorInstance = new Detector({
            formats: ["data_matrix", "qr_code"],
          });

          const tick = async () => {
            if (cancelled || !videoElement) {
              return;
            }

            try {
              const codes = await detector.detect(videoElement);

              if (cancelled) {
                return;
              }

              const [firstCode] = codes;

              if (firstCode?.rawValue) {
                emitResult({
                  rawValue: firstCode.rawValue,
                  format: firstCode.format ?? "unknown",
                  source: "barcode-detector",
                  timestamp: Date.now(),
                });

                if (!continuous) {
                  stop();
                  return;
                }
              }
            } catch (detectorError) {
              // Chromium throws NotAllowedError intermittently when the page loses focus.
              if (
                detectorError instanceof DOMException &&
                detectorError.name === "NotAllowedError"
              ) {
                setPermission("denied");
                setError("Camera permission denied.");
                stop();
                return;
              }
            }

            clearTimers();
            timeoutRef.current = window.setTimeout(tick, 200);
          };

          clearTimers();
          timeoutRef.current = window.setTimeout(tick, 50);

          return;
        }

        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);

        if (cancelled) {
          return;
        }

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);

        const reader = new BrowserMultiFormatReader(hints);

        setSource("zxing");
        setStatus("scanning");

        const controls = await reader.decodeFromStream(
          mediaStream,
          videoElement,
          (decodeResult, err, ctrl) => {
            if (ctrl) {
              readerControlsRef.current = ctrl;
            }

            if (decodeResult) {
              emitResult({
                rawValue: decodeResult.getText(),
                format: decodeResult.getBarcodeFormat().toString(),
                source: "zxing",
                timestamp: Date.now(),
              });

              if (!continuous) {
                stop();
              }
            } else if (err && err.name !== ZXING_NOT_FOUND_ERROR) {
              setError(err.message);
              setStatus("error");
            }
          },
        );

        readerControlsRef.current = controls;
      } catch (err) {
        if (cancelled) {
          return;
        }

        stop();

        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError") {
            setPermission("denied");
            setError("Camera permission denied by the user.");
            return;
          }

          if (err.name === "NotFoundError") {
            setError("No camera device was found.");
            return;
          }

          if (err.name === "NotReadableError") {
            setError("Camera is already in use by another application.");
            return;
          }
        }

        setError(
          err instanceof Error ? err.message : "Failed to initialise scanner.",
        );
        setStatus("error");
      }
    }

    initialiseScanner();

    return () => {
      cancelled = true;
      stop();
    };
  }, [
    clearTimers,
    constraints,
    continuous,
    emitResult,
    enabled,
    restartToken,
    stop,
  ]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    status,
    permission,
    error,
    result,
    source,
    restart,
    stop,
  };
}

async function decodeWithBarcodeDetector(
  source: CanvasImageSource,
): Promise<ScanResult | null> {
  if (!(await supportsBarcodeDetector())) {
    return null;
  }

  const Detector = (window as typeof window & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;

  if (!Detector) {
    return null;
  }

  const detector: BarcodeDetectorInstance = new Detector({
    formats: ["data_matrix", "qr_code"],
  });

  try {
    const results = await detector.detect(source);
    const [first] = results;

    if (!first?.rawValue) {
      return null;
    }

    return {
      rawValue: first.rawValue,
      format: first.format ?? "unknown",
      source: "barcode-detector",
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

async function decodeWithZxing(blob: Blob): Promise<ScanResult | null> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
    await Promise.all([import("@zxing/browser"), import("@zxing/library")]);

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.QR_CODE,
  ]);

  const reader = new BrowserMultiFormatReader(hints);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const result = await reader.decodeFromImageUrl(objectUrl);

    return {
      rawValue: result.getText(),
      format: result.getBarcodeFormat().toString(),
      source: "zxing",
      timestamp: Date.now(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === ZXING_NOT_FOUND_ERROR) {
      return null;
    }
    throw error;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function decodeImageBlob(
  blob: Blob,
): Promise<ScanResult | null> {
  if (typeof window === "undefined") {
    return null;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    if ("createImageBitmap" in window) {
      try {
        bitmap = await createImageBitmap(blob, {
          imageOrientation: "none",
          premultiplyAlpha: "premultiply",
        });
      } catch {
        bitmap = null;
      }
    }

    if (bitmap) {
      const detectorResult = await decodeWithBarcodeDetector(bitmap);
      if (detectorResult) {
        return detectorResult;
      }
    } else {
      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(blob);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () =>
            reject(new Error("Failed to load image for decoding."));
          img.src = objectUrl;
        });
        const detectorResult = await decodeWithBarcodeDetector(img);
        if (detectorResult) {
          return detectorResult;
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  } finally {
    if (bitmap) {
      bitmap.close();
    }
  }

  return await decodeWithZxing(blob);
}
