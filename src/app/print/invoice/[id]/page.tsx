import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintToolbar } from "@/components/print-toolbar";
import { requireAppUser } from "@/lib/auth";
import {
  getInvoiceDocument,
  getInvoiceMeterEvidence,
} from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAppUser();

  if (!user.ok) notFound();

  const { id } = await params;
  const { data, invoice, tenant, cycle } = await getInvoiceDocument(id);

  if (!invoice || !tenant) notFound();

  const meterEvidence = getInvoiceMeterEvidence(data, invoice);

  return (
    <main className="min-h-screen bg-muted/50 text-foreground">
      <PrintToolbar />
      <InvoiceDocument
        data={data}
        invoice={invoice}
        tenant={tenant}
        cycle={cycle}
        meterEvidence={meterEvidence}
      />
    </main>
  );
}
