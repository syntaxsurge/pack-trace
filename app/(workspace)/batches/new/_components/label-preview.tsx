"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type Gs1DatamatrixPayload } from "@/lib/labels/gs1";

interface LabelPreviewProps {
  payload: Gs1DatamatrixPayload | null;
  productName: string;
  quantity: number | null;
}

export function LabelPreview({
  payload,
  productName,
  quantity,
}: LabelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function render() {
      if (!canvasRef.current || !payload) {
        if (canvasRef.current) {
          canvasRef.current.width = 0;
          canvasRef.current.height = 0;
        }
        setRenderError(null);
        return;
      }

      setIsRendering(true);

      try {
        const mod = await import("bwip-js/browser");
        if (isCancelled || !canvasRef.current) {
          return;
        }

        mod.default.toCanvas(canvasRef.current, {
          bcid: "gs1datamatrix",
          text: payload.humanReadable,
          scale: 6,
          paddingwidth: 6,
          paddingheight: 6,
          includetext: false,
          backgroundcolor: "FFFFFF",
        });

        setRenderError(null);
      } catch (error) {
        setRenderError(
          error instanceof Error
            ? error.message
            : "Unable to generate DataMatrix.",
        );
      } finally {
        if (!isCancelled) {
          setIsRendering(false);
        }
      }
    }

    render();

    return () => {
      isCancelled = true;
    };
  }, [payload]);

  const handleDownload = useCallback(() => {
    if (!canvasRef.current || !payload) return;

    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = `${payload.gtin14}-${payload.lot}-label.png`;
    link.click();
  }, [payload]);

  const handlePrint = useCallback(() => {
    if (!canvasRef.current || !payload) return;

    const dataUrl = canvasRef.current.toDataURL("image/png");
    const title = productName || payload.gtin14;

    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title} label</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 16px;
        margin: 32px;
      }
      img {
        width: 240px;
        height: 240px;
        image-rendering: pixelated;
      }
      .meta {
        text-align: center;
        font-size: 14px;
        line-height: 1.4;
      }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" alt="GS1 DataMatrix for ${payload.humanReadable}" />
    <div class="meta">
      <strong>${title}</strong><br/>
      ${payload.humanReadable}<br/>
      ${quantity ? `Qty ${quantity}` : ""}
    </div>
    <script>
      window.onload = () => {
        window.print();
        window.close();
      };
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }, [payload, productName, quantity]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Label preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border bg-muted dark:bg-white">
            {payload ? (
              <canvas
                ref={canvasRef}
                aria-label={`GS1 DataMatrix for ${payload.humanReadable}`}
                role="img"
              />
            ) : (
              <p className="px-6 text-center text-sm text-muted-foreground">
                Enter GTIN, lot, and expiry to generate the DataMatrix preview.
              </p>
            )}
          </div>
          {payload && (
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{productName}</p>
              <p>{payload.humanReadable}</p>
              {quantity ? <p>Quantity: {quantity}</p> : null}
            </div>
          )}
        </div>
        {renderError ? (
          <p className="text-sm text-destructive">{renderError}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownload}
            disabled={!payload || isRendering}
          >
            Download PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePrint}
            disabled={!payload || isRendering}
          >
            Print label
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
