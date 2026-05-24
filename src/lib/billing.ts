import type { InvoiceItem, InvoiceStatus } from "@/lib/types";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function toSatang(value: number) {
  return Math.round(value * 100);
}

export function fromSatang(value: number | null | undefined) {
  return (value ?? 0) / 100;
}

export function calculateElectricityCharge(input: {
  previousReading: number;
  currentReading: number;
  rate: number;
}) {
  const usageUnits = Math.max(input.currentReading - input.previousReading, 0);
  const amount = usageUnits * input.rate;
  const warning =
    input.currentReading < input.previousReading
      ? "เลขมิเตอร์เดือนนี้ต่ำกว่าเดือนก่อน"
      : undefined;

  return { usageUnits, amount, warning };
}

export function calculateInvoiceTotals(input: {
  items: InvoiceItem[];
  discount?: number;
  vatEnabled?: boolean;
  vatRate?: number;
  paid?: number;
}) {
  const subtotal = input.items.reduce((sum, item) => sum + item.amount, 0);
  const discount = Math.max(input.discount ?? 0, 0);
  const taxable = Math.max(subtotal - discount, 0);
  const vatRate = input.vatRate ?? 7;
  const vatAmount = input.vatEnabled ? taxable * (vatRate / 100) : 0;
  const total = taxable + vatAmount;
  const paid = Math.max(input.paid ?? 0, 0);
  const balance = Math.max(total - paid, 0);

  return {
    subtotal,
    discount,
    vatRate,
    vatAmount,
    total,
    paid,
    balance,
  };
}

export function deriveInvoiceStatus(input: {
  total: number;
  paid: number;
  dueDate: string;
  issued?: boolean;
  voided?: boolean;
}): InvoiceStatus {
  if (input.voided) return "void";
  if (!input.issued) return "draft";
  if (input.paid >= input.total) return "paid";
  if (input.paid > 0) return "partial";
  if (new Date(input.dueDate).getTime() < Date.now()) return "overdue";
  return "issued";
}

export function nextRunningNo(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}
