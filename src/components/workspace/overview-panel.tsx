"use client";

import type { DashboardData } from "@/lib/types";
import { InvoiceList } from "./invoice-panel";
import { MeterList } from "./meter-panel";
import { PaymentList } from "./payment-panel";

export function OverviewPanel({
  data,
  cycleId,
}: {
  data: DashboardData;
  cycleId: string;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <InvoiceList data={data} cycleId={cycleId} compact />
      <div className="grid gap-4">
        <MeterList data={data} cycleId={cycleId} compact />
        <PaymentList data={data} cycleId={cycleId} compact />
      </div>
    </section>
  );
}
