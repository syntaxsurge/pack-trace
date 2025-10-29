"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabelPreview } from "@/app/(workspace)/batches/new/_components/label-preview";
import {
  batchLabelInputSchema,
  buildGs1DatamatrixPayload,
} from "@/lib/labels/gs1";
import { createBatchAction } from "@/app/(workspace)/batches/new/actions";
import type { CreateBatchActionState } from "@/app/(workspace)/batches/new/actions";

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
    if (state.status === "success") {
      setFormValues((values) => ({
        ...values,
        lot: "",
      }));
    }
  }, [state.status]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-6">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Labels are generated with GS1 DataMatrix using Application
                Identifiers (01) GTIN, (10) lot, and (17) expiry. All records are
                scoped to <span className="font-semibold">{facilityName}</span>.
              </p>
            </div>

            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="productName">Product name</Label>
                <Input
                  id="productName"
                  name="productName"
                  placeholder="Amoxicillin 500mg Capsules"
                  value={formValues.productName}
                  onChange={handleChange}
                  required
                  minLength={1}
                  maxLength={100}
                />
                {state.errors.productName ? (
                  <p className="text-sm text-destructive">
                    {state.errors.productName}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="gtin">GTIN</Label>
                <Input
                  id="gtin"
                  name="gtin"
                  inputMode="numeric"
                  pattern="\d{8,14}"
                  placeholder="09506000134352"
                  value={formValues.gtin}
                  onChange={handleChange}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Supports GTIN-8/12/13/14 (padded to 14 digits for encoding).
                </p>
                {state.errors.gtin ? (
                  <p className="text-sm text-destructive">{state.errors.gtin}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lot">Lot / batch code</Label>
                <Input
                  id="lot"
                  name="lot"
                  placeholder="A123"
                  value={formValues.lot}
                  onChange={handleChange}
                  required
                  maxLength={20}
                />
                {state.errors.lot ? (
                  <p className="text-sm text-destructive">{state.errors.lot}</p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="expiry">Expiry date</Label>
                  <Input
                    id="expiry"
                    name="expiry"
                    type="date"
                    value={formValues.expiry}
                    onChange={handleChange}
                    required
                    min="2020-01-01"
                  />
                  {state.errors.expiry ? (
                    <p className="text-sm text-destructive">
                      {state.errors.expiry}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min={1}
                    step={1}
                    value={formValues.quantity}
                    onChange={handleChange}
                    required
                  />
                  {state.errors.quantity ? (
                    <p className="text-sm text-destructive">
                      {state.errors.quantity}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {state.errors.form ? (
              <p className="text-sm text-destructive">{state.errors.form}</p>
            ) : null}
            {state.status === "success" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <span>{state.message ?? "Batch created."}</span>
                {state.batchId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/batches/${state.batchId}`}>
                      View timeline
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create batch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <LabelPreview
        payload={preview?.payload ?? null}
        productName={formValues.productName}
        quantity={preview?.quantity ?? null}
      />
    </div>
  );
}
