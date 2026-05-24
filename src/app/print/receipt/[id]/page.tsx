import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print-toolbar";
import { requireAppUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/billing";
import { getReceiptDocument } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAppUser();

  if (!user.ok) notFound();

  const { id } = await params;
  const { data, payment, invoice, tenant } = await getReceiptDocument(id);

  if (!payment || !invoice || !tenant) notFound();

  return (
    <main className="min-h-screen bg-muted/50 text-foreground">
      <PrintToolbar />
      <article className="print-page mx-auto mb-8 min-h-[148mm] w-full max-w-[210mm] border border-border bg-white p-6 shadow-sm sm:p-10">
        <header className="grid gap-6 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h1 className="text-2xl font-semibold">ใบเสร็จรับเงิน</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.organization.name}
            </p>
            <p className="mt-1 text-sm leading-6">{data.organization.address}</p>
            <p className="text-sm">
              เลขประจำตัวผู้เสียภาษี {data.organization.taxId}
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
            <h2 className="mt-1 text-lg font-semibold">{tenant.name}</h2>
            <p className="mt-2 text-sm leading-6">{tenant.billingAddress}</p>
          </div>
          <div className="grid gap-2 text-sm">
            <DocRow label="ช่องทาง" value={paymentMethod(payment.method)} />
            <DocRow
              label="ผู้ให้บริการ"
              value={payment.provider === "stripe" ? "Stripe PromptPay" : "บันทึกเอง"}
            />
            <DocRow label="อ้างอิง" value={payment.reference || "-"} />
            <DocRow label="หมายเหตุ" value={payment.notes || "-"} />
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

        <footer className="mt-10 grid gap-8 border-t border-border pt-8 text-sm sm:grid-cols-2">
          <div className="border-t border-border pt-3 text-center">
            ผู้รับเงิน
          </div>
          <div className="border-t border-border pt-3 text-center">
            ผู้จ่ายเงิน
          </div>
        </footer>
      </article>
    </main>
  );
}

function paymentMethod(method: string) {
  if (method === "cash") return "เงินสด";
  if (method === "promptpay") return "พร้อมเพย์";
  if (method === "bank_transfer") return "โอนธนาคาร";
  return "อื่น ๆ";
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
