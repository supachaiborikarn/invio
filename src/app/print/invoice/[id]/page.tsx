import { notFound } from "next/navigation";
import { MeterEvidenceSection } from "@/components/meter-evidence-section";
import { PrintToolbar } from "@/components/print-toolbar";
import { requireAppUser } from "@/lib/auth";
import {
  formatCurrency,
  formatDate,
  formatInvoiceType,
  formatNumber,
} from "@/lib/billing";
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
      <article className="print-page mx-auto mb-8 min-h-[297mm] w-full max-w-[210mm] border border-border bg-white p-6 shadow-sm sm:p-10">
        <header className="grid gap-6 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">ใบแจ้งหนี้</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.organization.name}
            </p>
            <p className="mt-1 text-sm leading-6">{data.organization.address}</p>
            <p className="text-sm">
              เลขประจำตัวผู้เสียภาษี {data.organization.taxId}
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:min-w-56">
            <DocRow label="เลขที่" value={invoice.invoiceNo} mono />
            <DocRow label="วันที่ออก" value={formatDate(invoice.issueDate)} />
            <DocRow label="ครบกำหนด" value={formatDate(invoice.dueDate)} />
            <DocRow label="รอบบิล" value={cycle?.label ?? "-"} />
            <DocRow label="ประเภท" value={formatInvoiceType(invoice.type)} />
          </div>
        </header>

        <section className="grid gap-4 border-b border-border py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">เรียกเก็บจาก</p>
            <h2 className="mt-1 text-lg font-semibold">{tenant.name}</h2>
            <p className="mt-2 text-sm leading-6">{tenant.billingAddress}</p>
          </div>
          <div className="grid gap-2 text-sm">
            <DocRow label="รหัสผู้เช่า" value={tenant.code} />
            <DocRow label="ผู้ติดต่อ" value={tenant.contactName || "-"} />
            <DocRow label="โทร" value={tenant.phone || "-"} />
            <DocRow label="เลขภาษี" value={tenant.taxId || "-"} />
          </div>
        </section>

        <section className="py-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 font-medium">รายการ</th>
                <th className="py-3 pl-2 text-right font-medium">จำนวน</th>
                <th className="py-3 pl-2 text-right font-medium">ราคา</th>
                <th className="py-3 pl-2 text-right font-medium">ยอด</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-border/70">
                  <td className="py-3 pr-3">{item.description}</td>
                  <td className="whitespace-nowrap py-3 pl-2 text-right">
                    {formatNumber(item.quantity)}
                  </td>
                  <td className="whitespace-nowrap py-3 pl-2 text-right">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="whitespace-nowrap py-3 pl-2 text-right font-medium">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <MeterEvidenceSection evidence={meterEvidence} />

        <section className="ml-auto grid max-w-sm gap-2 border-t border-border pt-5 text-sm">
          <DocRow label="ยอดก่อนภาษี" value={formatCurrency(invoice.subtotal)} />
          <DocRow label="ส่วนลด" value={formatCurrency(invoice.discount)} />
          <DocRow
            label={`VAT ${invoice.vatEnabled ? invoice.vatRate : 0}%`}
            value={formatCurrency(invoice.vatAmount)}
          />
          <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
            <span>ยอดสุทธิ</span>
            <span>{formatCurrency(invoice.total)}</span>
          </div>
          <DocRow label="ชำระแล้ว" value={formatCurrency(invoice.paid)} />
          <div className="flex items-center justify-between text-base font-semibold">
            <span>ค้างชำระ</span>
            <span>{formatCurrency(invoice.balance)}</span>
          </div>
        </section>

        <footer className="mt-12 grid gap-6 border-t border-border pt-6 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">หมายเหตุ</p>
            <p className="mt-2 leading-6 text-muted-foreground">
              {invoice.notes || "กรุณาชำระเงินภายในวันที่กำหนด"}
            </p>
          </div>
          <div className="grid gap-8">
            <div className="border-t border-border pt-3 text-center">
              ผู้รับเอกสาร
            </div>
            <div className="border-t border-border pt-3 text-center">
              ผู้อนุมัติ
            </div>
          </div>
        </footer>
      </article>
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
