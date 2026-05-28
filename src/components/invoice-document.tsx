/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";
import { formatInvoiceType, formatNumber } from "@/lib/billing";
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
  return new Intl.DateTimeFormat("th-TH", {
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
  if (invoice.type === "electricity") return "ใบแจ้งหนี้ค่าไฟฟ้า";
  if (invoice.type === "fuel_transport") return "ใบแจ้งหนี้ค่าขนส่งน้ำมัน";
  if (invoice.type === "rent") return "ใบแจ้งหนี้/ใบวางบิล";
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

const thaiDigits = [
  "ศูนย์",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า",
];

function thaiNumberBelowMillion(value: number) {
  const units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  const digits = String(value).split("").map(Number);

  return digits
    .map((digit, index) => {
      if (!digit) return "";

      const place = digits.length - index - 1;

      if (place === 0 && digit === 1 && digits.length > 1) return "เอ็ด";
      if (place === 1 && digit === 1) return "สิบ";
      if (place === 1 && digit === 2) return "ยี่สิบ";

      return `${thaiDigits[digit]}${units[place]}`;
    })
    .join("");
}

function thaiNumberText(value: number): string {
  if (value === 0) return thaiDigits[0];
  if (value < 1_000_000) return thaiNumberBelowMillion(value);

  const million = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;

  return `${thaiNumberText(million)}ล้าน${
    remainder ? thaiNumberBelowMillion(remainder) : ""
  }`;
}

function thaiBahtText(value: number) {
  const satangTotal = Math.round(value * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;

  if (satang) {
    return `${thaiNumberText(baht)}บาท${thaiNumberText(satang)}สตางค์`;
  }

  return `${thaiNumberText(baht)}บาทถ้วน`;
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
    length: Math.max(10 - invoiceRows.length, 0),
  });
  const organizationLines = addressLines(data.organization.address);
  const tenantLines = lines.length ? lines : ["-"];
  const contactValue = [data.organization.phone, data.organization.email]
    .filter(Boolean)
    .join(" / ");
  const paymentLines = [
    data.organization.bankAccountNumber
      ? `เลขที่บัญชี ${data.organization.bankAccountNumber}`
      : "",
    data.organization.bankAccountName
      ? `ชื่อบัญชี ${data.organization.bankAccountName}`
      : "",
    data.organization.bankName
      ? `ธนาคาร ${data.organization.bankName}`
      : "",
    data.organization.bankBranch ? `สาขา ${data.organization.bankBranch}` : "",
    data.organization.paymentLineId
      ? `โอนแล้วโปรดแจ้ง Line ID: ${data.organization.paymentLineId}`
      : "",
  ].filter(Boolean);

  const rawPpId = data.organization.promptpayId || data.organization.taxId || data.organization.phone || "";
  const cleanPp = rawPpId.replace(/[^0-9]/g, "");
  const hasValidPromptPay = cleanPp.length === 10 || cleanPp.length === 13 || cleanPp.length === 15;

  const qrPayload = hasValidPromptPay ? generatePromptPayPayload(cleanPp, invoice.total) : "";
  const qrImageUrl = qrPayload
    ? `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(qrPayload)}`
    : "";

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-3 text-[12px] leading-snug text-foreground print:max-w-none print:p-0 print:text-[11.5px] print:leading-snug print:text-black">
      <section className="mx-auto flex min-h-[297mm] w-[198mm] max-w-full flex-col bg-white px-6 py-6 print:min-h-[285mm] print:w-full print:px-0 print:py-0">
        <header className="grid gap-4 border-b-2 border-foreground pb-4 print:border-black print:pb-3 sm:grid-cols-[minmax(0,1fr)_62mm]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-primary print:text-black">
              เอกสารเรียกเก็บเงิน
            </p>
            <h1 className="mt-1 text-[28px] font-semibold text-foreground print:text-[26px] print:text-black">
              {documentTitle(invoice)}
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground print:text-[11px] print:text-black">
              {formatInvoiceType(invoice.type)}
              {cycle?.label ? ` · ${cycle.label}` : ""}
            </p>
          </div>
          <div className="grid gap-1 rounded-sm border border-foreground p-3 print:border-black print:p-2">
            <DocMeta label="เลขที่เอกสาร" value={invoice.invoiceNo} />
            <DocMeta label="วันที่ออก" value={formatInvoiceDate(invoice.issueDate)} />
            <DocMeta label="ครบกำหนด" value={formatInvoiceDate(invoice.dueDate)} />
            <DocMeta label="สถานะ" value={invoiceStatusText(invoice.status)} />
          </div>
        </header>

        <section className="mt-4 grid gap-3 print:mt-3 sm:grid-cols-2">
          <PartyBlock
            title="ผู้วางบิล"
            name={data.organization.name}
            lines={[
              ...organizationLines,
              data.organization.taxId
                ? `เลขประจำตัวผู้เสียภาษี ${data.organization.taxId}`
                : "",
              data.organization.phone ? `โทร. ${data.organization.phone}` : "",
              data.organization.email ? `อีเมล ${data.organization.email}` : "",
            ]}
          />
          <PartyBlock
            title="ลูกค้า / ผู้รับใบแจ้งหนี้"
            name={tenant.name}
            lines={[
              ...tenantLines,
              tenant.taxId ? `เลขประจำตัวผู้เสียภาษี ${tenant.taxId}` : "",
              tenant.contactName ? `ผู้ติดต่อ ${tenant.contactName}` : "",
              tenant.phone ? `โทร. ${tenant.phone}` : "",
              tenant.email ? `อีเมล ${tenant.email}` : "",
            ]}
          />
        </section>

        <table className="mt-4 w-full table-fixed border-collapse text-[11px] print:mt-3 print:text-[10.5px]">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[52%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="bg-foreground text-background print:bg-white print:text-black">
              <TableHead>ลำดับ</TableHead>
              <TableHead>รายการ</TableHead>
              <TableHead align="right">จำนวน</TableHead>
              <TableHead align="right">ราคา/หน่วย</TableHead>
              <TableHead align="right">จำนวนเงิน</TableHead>
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map((row) => (
              <tr key={row.key} className="h-8 align-top print:h-6">
                <TableCell align="center">{row.no}</TableCell>
                <TableCell>
                  <p className="font-medium">{row.description}</p>
                  {row.evidence ? (
                    <p className="mt-1 text-[10px] text-muted-foreground print:text-[9.5px] print:text-black">
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
                </TableCell>
                <TableCell align="right">{row.quantity}</TableCell>
                <TableCell align="right">{row.unitPrice}</TableCell>
                <TableCell align="right" strong>
                  {row.amount}
                </TableCell>
              </tr>
            ))}
            {blankRows.map((_, index) => (
              <tr key={`blank-${index}`} className="h-7 print:h-5">
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 grid gap-4 print:mt-3 sm:grid-cols-[minmax(0,1fr)_72mm]">
          <div className={`grid content-start gap-3 ${hasValidPromptPay ? "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] print:grid-cols-[minmax(0,1fr)_110px]" : ""}`}>
            <div className="grid content-start gap-3">
              <div className="rounded-sm border border-border bg-secondary/40 p-3 print:border-black print:bg-white print:p-2">
                <p className="text-[11px] text-muted-foreground print:text-[10.5px] print:text-black">
                  จำนวนเงินทั้งสิ้น
                </p>
                <p className="mt-1 text-base font-semibold print:text-[14px]">
                  {thaiBahtText(invoice.total)}
                </p>
              </div>
              <div className="rounded-sm border border-border p-3 print:border-black print:p-2">
                <p className="font-semibold">ชำระเงิน</p>
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground print:text-[10.5px] print:text-black">
                  <p>อ้างอิงเลขที่เอกสาร {invoice.invoiceNo}</p>
                  {paymentLines.length ? (
                    paymentLines.map((line) => <p key={line}>{line}</p>)
                  ) : (
                    <p>
                      ช่องทางออนไลน์{" "}
                      {data.stripeConfigured ? "PromptPay ผ่านลิงก์ผู้เช่า" : "ลิงก์ผู้เช่า"}
                    </p>
                  )}
                  <p>ติดต่อ {contactValue || "-"}</p>
                </div>
              </div>
            </div>

            {hasValidPromptPay && qrImageUrl && (
              <div className="flex flex-col items-center justify-center rounded-sm border border-border p-2 bg-white print:border-black print:p-1.5 self-stretch">
                <img
                  src={qrImageUrl}
                  alt="PromptPay QR Code"
                  className="aspect-square w-[100px] h-[100px] print:w-[90px] print:h-[90px] object-contain"
                />
                <div className="mt-1 text-center select-none">
                  <p className="text-[9px] font-bold text-foreground print:text-black leading-none">พร้อมเพย์ สแกนจ่าย</p>
                  <p className="text-[8px] text-muted-foreground mt-1 print:text-black font-mono leading-none tracking-tighter">
                    {formatPromptPayDisplay(cleanPp)}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="grid content-start rounded-sm border border-foreground print:border-black">
            <SummaryLine label="รวมเป็นเงิน" value={invoice.subtotal} />
            {invoice.discount > 0 ? (
              <SummaryLine label="ส่วนลด" value={invoice.discount * -1} />
            ) : null}
            <SummaryLine
              label={`ภาษีมูลค่าเพิ่ม ${invoice.vatRate}%`}
              value={invoice.vatAmount}
            />
            <SummaryLine label="รวมราคาทั้งสิ้น" value={invoice.total} strong />
            {invoice.paid > 0 ? (
              <SummaryLine label="ชำระแล้ว" value={invoice.paid * -1} />
            ) : null}
            <SummaryLine label="ยอดค้างชำระ" value={invoice.balance} strong />
          </div>
        </section>

        {invoice.notes ? (
          <section className="mt-4 rounded-sm border border-border p-3 text-[11px] print:mt-3 print:border-black print:p-2 print:text-[10px]">
            <p className="font-semibold">หมายเหตุ</p>
            <p className="mt-1 text-muted-foreground print:text-black">
              {invoice.notes}
            </p>
          </section>
        ) : null}

        {meterEvidence.length ? (
          <section className="mt-5 grid gap-3 print:mt-3 print:gap-2">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2 print:border-black print:pb-1">
              <h2 className="text-sm font-semibold print:text-[12.5px]">
                หลักฐานรูปมิเตอร์
              </h2>
              <p className="text-[11px] text-muted-foreground print:text-[10.5px] print:text-black">
                รูปเดือนก่อนและเดือนปัจจุบัน
              </p>
            </div>
            {meterEvidence.map((evidence) => (
              <MeterEvidenceBlock key={evidence.id} evidence={evidence} />
            ))}
          </section>
        ) : null}

        <section className="mt-auto grid grid-cols-2 gap-10 pt-12 text-center font-semibold print:pt-8 print:text-[11.5px]">
          <SignatureBlock label="ผู้รับใบแจ้งหนี้" />
          <SignatureBlock label="ผู้วางบิลเก็บเงิน" />
        </section>
      </section>
    </article>
  );
}

function PartyBlock({
  title,
  name,
  lines,
}: {
  title: string;
  name: string;
  lines: string[];
}) {
  return (
    <div className="min-w-0 rounded-sm border border-border p-3 print:border-black print:p-2">
      <p className="text-[11px] font-semibold text-muted-foreground print:text-[10.5px] print:text-black">
        {title}
      </p>
      <h2 className="mt-1 text-[15px] font-semibold print:text-[13px]">
        {name || "-"}
      </h2>
      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground print:text-[10.5px] print:text-black">
        {lines.filter(Boolean).map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`border border-foreground px-2 py-2 print:border-black print:px-1.5 print:py-1.5 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  align = "left",
  strong,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  strong?: boolean;
}) {
  const alignment =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "";

  return (
    <td
      className={`border border-border px-2 py-1.5 print:border-black print:px-1.5 print:py-1 ${
        strong ? "font-semibold" : ""
      } ${alignment}`}
    >
      {children}
    </td>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_32mm] border-b border-border last:border-b-0 print:border-black ${
        strong ? "bg-secondary/60 print:bg-white" : ""
      }`}
    >
      <div className="px-3 py-2 font-semibold print:px-2 print:py-1.5">
        {label}
      </div>
      <div className="border-l border-border px-3 py-2 text-right font-semibold print:border-black print:px-2 print:py-1.5">
        {formatMoney(value)}
      </div>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="mx-auto mb-2 h-10 w-44 border-b border-foreground print:h-8 print:w-36 print:border-black" />
      <p>{label}</p>
      <p className="mt-1 text-[10px] font-normal text-muted-foreground print:text-[9.5px] print:text-black">
        วันที่ ................................
      </p>
    </div>
  );
}

function DocMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-1 last:border-0 last:pb-0 print:gap-2 print:border-black">
      <dt className="text-[10px] font-medium text-muted-foreground print:text-[9.5px] print:text-black">
        {label}
      </dt>
      <dd className="text-right text-[11px] font-semibold print:text-[10.5px]">
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
      <div className="grid content-start gap-2 rounded-sm bg-secondary/60 p-3 text-[11px] print:gap-1.5 print:border print:border-black print:bg-white print:p-2 print:text-[11px]">
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
      <div className="flex items-center justify-between gap-3 text-[11px] print:text-[11px]">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground print:text-black">{date}</p>
      </div>
      <div className="mt-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-secondary/40 print:mt-1 print:h-[54mm] print:aspect-auto print:border-black print:bg-white">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`รูปมิเตอร์${title}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <p className="px-3 text-center text-[11px] text-muted-foreground print:text-[10.5px] print:text-black">
            เว้นไว้สำหรับรูปมิเตอร์จริง
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] print:mt-1 print:text-[11px]">
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

function crc16xmodem(data: string, crc = 0xffff): number {
  const bytes = new TextEncoder().encode(data);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc ^ (bytes[i] << 8)) & 0xFFFF;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

function generatePromptPayPayload(target: string, amount?: number): string {
  const cleanTarget = target.replace(/[^0-9]/g, "");
  if (!cleanTarget) return "";

  const targetType =
    cleanTarget.length >= 15
      ? "03" // e-Wallet
      : cleanTarget.length >= 13
      ? "02" // Tax ID / Citizen ID
      : "01"; // Phone number

  let formattedTarget = cleanTarget;
  if (cleanTarget.length < 13) {
    formattedTarget = ("0000000000000" + cleanTarget.replace(/^0/, "66")).slice(-13);
  }

  const f = (id: string, value: string) => {
    return [id, ("00" + value.length).slice(-2), value].join("");
  };

  const serialize = (xs: string[]) => xs.filter(Boolean).join("");

  const data = [
    f("00", "01"),
    f("01", amount ? "12" : "11"),
    f(
      "29",
      serialize([
        f("00", "A000000677010111"),
        f(targetType, formattedTarget),
      ])
    ),
    f("58", "TH"),
    f("53", "764"),
    amount ? f("54", amount.toFixed(2)) : "",
  ];

  const dataToCrc = serialize(data) + "63" + "04";
  const checksum = crc16xmodem(dataToCrc, 0xffff);
  const formattedCrc = ("0000" + checksum.toString(16).toUpperCase()).slice(-4);
  
  data.push(f("63", formattedCrc));

  return serialize(data);
}

function formatPromptPayDisplay(id: string): string {
  if (id.length === 10) {
    return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  }
  if (id.length === 13) {
    return `${id.slice(0, 1)}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id.slice(12)}`;
  }
  return id;
}
