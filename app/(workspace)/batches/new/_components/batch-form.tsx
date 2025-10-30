"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabelPreview } from "@/app/(workspace)/batches/new/_components/label-preview";
import {
  batchLabelInputSchema,
  buildGs1DatamatrixPayload,
} from "@/lib/labels/gs1";
import { createBatchAction } from "@/app/(workspace)/batches/new/actions";
import type { CreateBatchActionState } from "@/app/(workspace)/batches/new/actions";
import type { Gs1DatamatrixPayload } from "@/lib/labels/gs1";
import { LabelIdentityPanel } from "@/app/(workspace)/batches/_components/label-identity-panel";
import { Package, Hash, Calendar, CheckCircle2, Loader2, AlertCircle, Info, Building2 } from "lucide-react";

const EMPTY_FORM = {
  productName: "",
  gtin: "",
  lot: "",
  expiry: "",
  quantity: "1",
};

type FormValues = typeof EMPTY_FORM;

const INITIAL_ACTION_STATE: CreateBatchActionState = {
  status: "idle",
  errors: {},
};

interface BatchFormProps {
  facilityName: string;
}

export function BatchForm({ facilityName }: BatchFormProps) {
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [state, formAction, isPending] = useActionState<
    CreateBatchActionState,
    FormData
  >(createBatchAction, INITIAL_ACTION_STATE);
  const [lastIdentity, setLastIdentity] = useState<{
    payload: Gs1DatamatrixPayload;
    quantity: number;
    productName: string;
    facilityName: string;
  } | null>(null);

  const preview = useMemo(() => {
    const parsed = batchLabelInputSchema.safeParse({
      ...formValues,
      quantity: formValues.quantity,
    });

    if (!parsed.success) {
      return null;
    }

    return {
      payload: buildGs1DatamatrixPayload(parsed.data),
      quantity: parsed.data.quantity,
    };
  }, [formValues]);

  useEffect(() => {
    if (state.status === "success" && preview?.payload) {
      setLastIdentity({
        payload: preview.payload,
        quantity: preview.quantity,
        productName: formValues.productName,
        facilityName,
      });
      setFormValues((values) => ({
        ...values,
        lot: "",
      }));
    }
  }, [facilityName, formValues.productName, preview, state.status]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
      <div className="space-y-6">
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Batch Details</CardTitle>
                <CardDescription>Enter product information for GS1 DataMatrix label</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-6">
              <Alert className="bg-info/5 border-info/20">
                <Info className="h-4 w-4 text-info" />
                <AlertDescription className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-3 w-3" />
                    <span className="font-semibold">{facilityName}</span>
                  </div>
                  Labels use GS1 DataMatrix with AI: (01) GTIN, (10) Lot, and (17) Expiry
                </AlertDescription>
              </Alert>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="productName" className="text-sm font-semibold">Product Name</Label>
                  <div className="relative">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="productName"
                      name="productName"
                      placeholder="Amoxicillin 500mg Capsules"
                      className="pl-10 h-11"
                      value={formValues.productName}
                      onChange={handleChange}
                      required
                      minLength={1}
                      maxLength={100}
                    />
                  </div>
                  {state.errors.productName && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-3 w-3" />
                      <AlertDescription className="text-xs">
                        {state.errors.productName}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gtin" className="text-sm font-semibold">GTIN</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="gtin"
                      name="gtin"
                      inputMode="numeric"
                      pattern="\d{8,14}"
                      placeholder="09506000134352"
                      className="pl-10 h-11 font-mono"
                      value={formValues.gtin}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Supports GTIN-8/12/13/14 (padded to 14 digits)
                  </p>
                  {state.errors.gtin && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-3 w-3" />
                      <AlertDescription className="text-xs">
                        {state.errors.gtin}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lot" className="text-sm font-semibold">Lot / Batch Code</Label>
                  <Input
                    id="lot"
                    name="lot"
                    placeholder="A123"
                    className="h-11 font-mono"
                    value={formValues.lot}
                    onChange={handleChange}
                    required
                    maxLength={20}
                  />
                  {state.errors.lot && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-3 w-3" />
                      <AlertDescription className="text-xs">
                        {state.errors.lot}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="expiry" className="text-sm font-semibold">Expiry Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="expiry"
                        name="expiry"
                        type="date"
                        className="pl-10 h-11"
                        value={formValues.expiry}
                        onChange={handleChange}
                        required
                        min="2020-01-01"
                      />
                    </div>
                    {state.errors.expiry && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-3 w-3" />
                        <AlertDescription className="text-xs">
                          {state.errors.expiry}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-sm font-semibold">Quantity</Label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="quantity"
                        name="quantity"
                        type="number"
                        min={1}
                        step={1}
                        className="pl-10 h-11"
                        value={formValues.quantity}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    {state.errors.quantity && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-3 w-3" />
                        <AlertDescription className="text-xs">
                          {state.errors.quantity}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              </div>

              {state.errors.form && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{state.errors.form}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  size="lg"
                  className="w-full sm:w-auto min-w-[200px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Batch...
                    </>
                  ) : (
                    <>
                      <Package className="mr-2 h-4 w-4" />
                      Create Batch
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {state.status === "success" && (
          <Alert className="bg-success/10 border-success/50 border-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <AlertDescription>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold text-success">
                    {state.message ?? "Batch created successfully!"}
                  </span>
                  {state.batchId && (
                    <Button asChild size="sm" variant="default">
                      <Link href={`/batches/${state.batchId}`} prefetch={false}>
                        View Timeline
                      </Link>
                    </Button>
                  )}
                </div>
                {lastIdentity && (
                  <LabelIdentityPanel
                    labelText={lastIdentity.payload.humanReadable}
                    batchId={state.batchId}
                    productName={lastIdentity.productName}
                    gtin={lastIdentity.payload.gtin14}
                    lot={lastIdentity.payload.lot}
                    expiry={lastIdentity.payload.expiryIsoDate}
                    quantity={lastIdentity.quantity}
                    facilityName={lastIdentity.facilityName}
                    note="This label is deterministic—reprint or download it anytime from the batch page."
                    printLabel="Print label"
                  />
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="lg:sticky lg:top-24 lg:h-fit">
        <LabelPreview
          payload={preview?.payload ?? null}
          productName={formValues.productName}
          quantity={preview?.quantity ?? null}
        />
      </div>
    </div>
  );
}
