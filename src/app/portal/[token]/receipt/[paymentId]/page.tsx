import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/billing";
import { getTenantPortalData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function PortalReceiptPage({
  params,
}: {
  params: Promise<{ token: string; paymentId: string }>;
}) {
  const { token, paymentId } = await params;
  const portal = await getTenantPortalData(token);
  const payment = portal?.payments.find((item) => item.id === paymentId);
  const invoice = payment
    ? portal?.invoices.find((item) => item.id === payment.invoiceId)
    : undefined;

  if (!portal || !payment || !invoice) notFound();

  return (
    <main className="min-h-screen bg-muted/50 px-4 py-6 text-foreground">
      <section className="mx-auto grid w-full max-w-[210mm] gap-4">
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/portal/${token}`}>กลับหน้าผู้เช่า</Link>
        </Button>

        <article className="print-page border border-border bg-white p-6 shadow-sm sm:p-10">
          <header className="grid gap-6 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h1 className="text-2xl font-semibold">ใบเสร็จรับเงิน</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {portal.data.organization.name}
              </p>
              <p className="mt-1 text-sm leading-6">
                {portal.data.organization.address}
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:min-w-56">
              <DocRow label="เลขที่" value={payment.receiptNo} mono />
              <DocRow label="วันที่รับเงิน" value={formatDate(payment.paidAt)} />
              <DocRow label="ใบแจ้งหนี้" value={invoice.invoiceNo} mono />
            </div>
          </header>

          <section className="grid gap-4 border-b border-border py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">รับเงินจาก</p>
              <h2 className="mt-1 text-lg font-semibold">
                {portal.tenant.name}
              </h2>
              <p className="mt-2 text-sm leading-6">
                {portal.tenant.billingAddress}
              </p>
            </div>
            <div className="grid gap-2 text-sm">
              <DocRow label="ช่องทาง" value={payment.method} />
              <DocRow label="ผู้ให้บริการ" value={payment.provider} />
              <DocRow label="อ้างอิง" value={payment.reference || "-"} />
            </div>
          </section>

          <section className="ml-auto grid max-w-sm gap-2 py-6 text-sm">
            <DocRow label="ยอดรับชำระ" value={formatCurrency(payment.amount)} />
            <DocRow label="ยอดใบแจ้งหนี้" value={formatCurrency(invoice.total)} />
            <DocRow label="ค้างชำระหลังรับเงิน" value={formatCurrency(invoice.balance)} />
            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>ยอดรับสุทธิ</span>
              <span>{formatCurrency(payment.amount)}</span>
            </div>
          </section>
        </article>
      </section>
    </main>
  );
}

function DocRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-right"}>{value}</span>
    </div>
  );
}

