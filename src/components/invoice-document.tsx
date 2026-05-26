/* eslint-disable @next/next/no-img-element */

import { formatCurrency, formatInvoiceType, formatNumber } from "@/lib/billing";
import type { InvoiceMeterEvidence } from "@/lib/dashboard-data";
import type {
  BillingCycle,
  DashboardData,
  Invoice,
  Tenant,
} from "@/lib/types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnitPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatMeterDate(value: string) {
  const date = new Date(value);
  const year = String((date.getFullYear() + 543) % 100).padStart(2, "0");

  return `${date.getDate()}/${date.getMonth() + 1}/${year}`;
}

function documentTitle(invoice: Invoice) {
  if (invoice.type === "electricity") return "ใบแจ้งหนี้ค่าไฟฟ้า-น้ำประปา";
  if (invoice.type === "fuel_transport") return "ใบแจ้งหนี้ค่าขนส่งน้ำมัน";
  return `ใบแจ้งหนี้${formatInvoiceType(invoice.type)}`;
}

function invoiceStatusText(status: Invoice["status"]) {
  const labels: Record<Invoice["status"], string> = {
    draft: "ร่าง",
    issued: "รอชำระ",
    partial: "ชำระบางส่วน",
    paid: "ชำระแล้ว",
    overdue: "เกินกำหนด",
    void: "ยกเลิก",
  };

  return labels[status];
}

function addressLines(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function InvoiceDocument({
  data,
  invoice,
  tenant,
  cycle,
  meterEvidence,
}: {
  data: DashboardData;
  invoice: Invoice;
  tenant: Tenant;
  cycle?: BillingCycle;
  meterEvidence: InvoiceMeterEvidence[];
}) {
  const lines = addressLines(tenant.billingAddress);
  const evidenceByReadingId = new Map(
    meterEvidence.map((item) => [item.id, item]),
  );
  const invoiceRows = invoice.items.map(
    (item, index): {
      key: string;
      no: number;
      description: string;
      quantity: string;
      unitPrice: string;
      amount: string;
      evidence?: InvoiceMeterEvidence;
    } => {
      const evidence = item.meterReadingId
        ? evidenceByReadingId.get(item.meterReadingId)
        : undefined;

      return {
        key: item.id,
        no: index + 1,
        description: item.description,
        quantity: formatNumber(item.quantity),
        unitPrice: formatUnitPrice(item.unitPrice),
        amount: formatMoney(item.amount),
        evidence,
      };
    },
  );
  const blankRows = Array.from({
    length: Math.max(4 - invoiceRows.length, 0),
  });

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-3 text-[12px] leading-snug text-foreground print:max-w-none print:p-0 print:text-[10px] print:leading-tight print:text-black">
      <section className="mx-auto min-h-[297mm] w-[190mm] max-w-full bg-white px-7 py-6 print:flex print:min-h-[285mm] print:w-full print:flex-col print:px-0 print:py-0">
        <header className="border-b-4 border-primary pb-4 print:border-b-2 print:border-black print:pb-3">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_52mm] sm:items-start">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary print:text-[8px] print:text-black">
                Invoice
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground print:text-xl print:text-black">
                {documentTitle(invoice)}
              </h1>
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground print:mt-2 print:text-[9px] print:text-black">
                <p className="font-semibold text-foreground print:text-black">
                  {data.organization.name}
                </p>
                <p>{data.organization.address}</p>
                <p>เลขประจำตัวผู้เสียภาษี {data.organization.taxId}</p>
              </div>
            </div>
            <div className="rounded-sm bg-primary p-4 text-primary-foreground print:border print:border-black print:bg-white print:p-3 print:text-black">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] print:text-[8px]">
                Total
              </p>
              <p className="mt-1 text-2xl font-semibold print:text-xl">
                {formatCurrency(invoice.total)}
              </p>
              <dl className="mt-4 grid gap-1 text-[11px] print:mt-3 print:text-[9px]">
                <div className="flex items-center justify-between gap-3">
                  <dt>เลขที่</dt>
                  <dd className="font-semibold">{invoice.invoiceNo}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>วันที่</dt>
                  <dd>{formatInvoiceDate(invoice.issueDate)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-3 print:mt-3 print:gap-2 sm:grid-cols-[minmax(0,1fr)_58mm]">
          <div className="rounded-sm border border-border p-4 print:border-black print:p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground print:text-[8px] print:text-black">
              Bill To
            </p>
            <h2 className="mt-2 text-base font-semibold print:text-[11px]">
              {tenant.name}
            </h2>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground print:text-[9px] print:text-black">
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>เลขประจำตัวผู้เสียภาษี {tenant.taxId}</p>
              {tenant.phone ? <p>โทร. {tenant.phone}</p> : null}
            </div>
          </div>
          <div className="grid gap-2 rounded-sm border border-border bg-secondary/50 p-4 print:border-black print:bg-white print:p-3">
            <DocMeta label="รอบบิล" value={cycle?.label ?? "-"} />
            <DocMeta label="ประเภท" value={formatInvoiceType(invoice.type)} />
            <DocMeta label="ครบกำหนด" value={formatInvoiceDate(invoice.dueDate)} />
            <DocMeta label="สถานะ" value={invoiceStatusText(invoice.status)} />
          </div>
        </section>

        <table className="mt-5 w-full table-fixed border-collapse text-[11px] print:mt-3 print:text-[9px]">
          <colgroup>
            <col className="w-[9%]" />
            <col className="w-[50%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="bg-foreground text-background print:bg-white print:text-black">
              <th className="border border-foreground px-2 py-2 text-left print:border-black print:px-1.5 print:py-1.5">
                ลำดับ
              </th>
              <th className="border border-foreground px-2 py-2 text-left print:border-black print:px-1.5 print:py-1.5">
                รายการ
              </th>
              <th className="border border-foreground px-2 py-2 text-right print:border-black print:px-1.5 print:py-1.5">
                จำนวน
              </th>
              <th className="border border-foreground px-2 py-2 text-right print:border-black print:px-1.5 print:py-1.5">
                ราคา/หน่วย
              </th>
              <th className="border border-foreground px-2 py-2 text-right print:border-black print:px-1.5 print:py-1.5">
                จำนวนเงิน
              </th>
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map((row) => (
              <tr key={row.key} className="h-9 align-top print:h-7">
                <td className="border border-border px-2 py-2 text-center print:border-black print:px-1.5 print:py-1.5">
                  {row.no}
                </td>
                <td className="border border-border px-2 py-2 print:border-black print:px-1.5 print:py-1.5">
                  <p className="font-medium">{row.description}</p>
                  {row.evidence ? (
                    <p className="mt-1 text-[10px] text-muted-foreground print:text-[8px] print:text-black">
                      หน่วยเริ่มต้น{" "}
                      {formatMeterDate(
                        row.evidence.previousCapturedAt ??
                          cycle?.periodStart ??
                          row.evidence.capturedAt,
                      )}{" "}
                      = {formatNumber(row.evidence.previousReading)} ·
                      หน่วยสิ้นสุด {formatMeterDate(row.evidence.capturedAt)} ={" "}
                      {formatNumber(row.evidence.currentReading)}
                    </p>
                  ) : null}
                </td>
                <td className="border border-border px-2 py-2 text-right print:border-black print:px-1.5 print:py-1.5">
                  {row.quantity}
                </td>
                <td className="border border-border px-2 py-2 text-right print:border-black print:px-1.5 print:py-1.5">
                  {row.unitPrice}
                </td>
                <td className="border border-border px-2 py-2 text-right font-semibold print:border-black print:px-1.5 print:py-1.5">
                  {row.amount}
                </td>
              </tr>
            ))}
            {blankRows.map((_, index) => (
              <tr key={`blank-${index}`} className="h-7 print:h-6">
                <td className="border border-border print:border-black">&nbsp;</td>
                <td className="border border-border print:border-black">&nbsp;</td>
                <td className="border border-border print:border-black">&nbsp;</td>
                <td className="border border-border print:border-black">&nbsp;</td>
                <td className="border border-border print:border-black">&nbsp;</td>
              </tr>
            ))}
            <tr>
              <td
                className="border-x border-border print:border-black"
                colSpan={3}
                rowSpan={3}
              />
              <td className="border border-border px-2 py-2 font-semibold print:border-black print:px-1.5 print:py-1.5">
                รวมเป็นเงิน
              </td>
              <td className="border border-border px-2 py-2 text-right font-semibold print:border-black print:px-1.5 print:py-1.5">
                {formatMoney(invoice.subtotal)}
              </td>
            </tr>
            <tr>
              <td className="border border-border px-2 py-2 font-semibold print:border-black print:px-1.5 print:py-1.5">
                ภาษีมูลค่าเพิ่ม {invoice.vatRate}%
              </td>
              <td className="border border-border px-2 py-2 text-right font-semibold print:border-black print:px-1.5 print:py-1.5">
                {formatMoney(invoice.vatAmount)}
              </td>
            </tr>
            <tr className="bg-secondary/70 print:bg-white">
              <td className="border border-border px-2 py-2 font-semibold print:border-black print:px-1.5 print:py-1.5">
                รวมราคาทั้งสิ้น
              </td>
              <td className="border border-border px-2 py-2 text-right text-sm font-semibold print:border-black print:px-1.5 print:py-1.5 print:text-[11px]">
                {formatMoney(invoice.total)}
              </td>
            </tr>
          </tbody>
        </table>

        {meterEvidence.length ? (
          <section className="mt-5 grid gap-3 print:mt-3 print:gap-2">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2 print:border-black print:pb-1">
              <h2 className="text-sm font-semibold print:text-[11px]">
                หลักฐานรูปมิเตอร์
              </h2>
              <p className="text-[11px] text-muted-foreground print:text-[8px] print:text-black">
                ใช้รูปเดือนก่อนคู่กับรูปเดือนปัจจุบัน
              </p>
            </div>
            {meterEvidence.map((evidence) => (
              <MeterEvidenceBlock key={evidence.id} evidence={evidence} />
            ))}
          </section>
        ) : null}

        <section className="mt-10 grid grid-cols-2 gap-6 text-center font-semibold print:mt-auto print:pt-8 print:text-[10px]">
          <div>
            <div className="mx-auto mb-2 w-40 border-t border-foreground print:w-32 print:border-black" />
            <p>ผู้รับใบแจ้งหนี้</p>
          </div>
          <div>
            <div className="mx-auto mb-2 w-40 border-t border-foreground print:w-32 print:border-black" />
            <p>ผู้วางบิลเก็บเงิน</p>
          </div>
        </section>
      </section>
    </article>
  );
}

function DocMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-1 last:border-0 last:pb-0 print:gap-2 print:border-black">
      <dt className="text-[10px] font-medium text-muted-foreground print:text-[8px] print:text-black">
        {label}
      </dt>
      <dd className="text-right text-[11px] font-semibold print:text-[9px]">
        {value}
      </dd>
    </div>
  );
}

function MeterEvidenceBlock({ evidence }: { evidence: InvoiceMeterEvidence }) {
  const previousDate = formatMeterDate(
    evidence.previousCapturedAt ?? evidence.capturedAt,
  );
  const currentDate = formatMeterDate(evidence.capturedAt);

  return (
    <div className="grid gap-3 rounded-sm border border-border p-3 print:break-inside-avoid print:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_34mm] print:gap-2 print:border-black print:p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_42mm]">
      <EvidenceImageBox
        title="เดือนก่อน"
        date={previousDate}
        reading={evidence.previousReading}
        imageUrl={evidence.previousImageUrl}
      />
      <EvidenceImageBox
        title="เดือนปัจจุบัน"
        date={currentDate}
        reading={evidence.currentReading}
        imageUrl={evidence.imageUrl}
      />
      <div className="grid content-start gap-2 rounded-sm bg-secondary/60 p-3 text-[11px] print:gap-1.5 print:border print:border-black print:bg-white print:p-2 print:text-[9px]">
        <p className="font-semibold">{evidence.unitCode || evidence.unitName}</p>
        {evidence.meterSerial ? (
          <p className="text-muted-foreground print:text-black">
            เลขมิเตอร์ {evidence.meterSerial}
          </p>
        ) : null}
        <EvidenceLine label="ก่อน" value={formatNumber(evidence.previousReading)} />
        <EvidenceLine label="หลัง" value={formatNumber(evidence.currentReading)} />
        <EvidenceLine
          label="ใช้จริง"
          value={`${formatNumber(evidence.usageUnits)} หน่วย`}
        />
        {evidence.warning ? (
          <p className="rounded-sm bg-destructive/10 px-2 py-1 text-destructive print:border print:border-black print:bg-white print:px-1.5 print:py-1 print:text-black">
            {evidence.warning}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceImageBox({
  title,
  date,
  reading,
  imageUrl,
}: {
  title: string;
  date: string;
  reading: number;
  imageUrl?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-[11px] print:text-[9px]">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground print:text-black">{date}</p>
      </div>
      <div className="mt-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-secondary/40 print:mt-1 print:h-[96mm] print:aspect-auto print:border-black print:bg-white">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`รูปมิเตอร์${title}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <p className="px-3 text-center text-[11px] text-muted-foreground print:text-[8px] print:text-black">
            เว้นไว้สำหรับรูปมิเตอร์จริง
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] print:mt-1 print:text-[9px]">
        <span className="text-muted-foreground print:text-black">เลขมิเตอร์</span>
        <span className="font-semibold">{formatNumber(reading)}</span>
      </div>
    </div>
  );
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-2 print:gap-2 print:border-black print:pt-1.5">
      <span className="text-muted-foreground print:text-black">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
