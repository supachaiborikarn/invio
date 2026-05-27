"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInvoiceType, formatDate as formatBillingDate } from "@/lib/billing";
import type {
  DashboardData,
  BillingCycle,
  Invoice,
  InvoiceItem,
  InvoiceType,
  Payment,
  RentalUnit,
  Tenant,
} from "@/lib/types";

export type WorkspaceTab =
  | "overview"
  | "cycles"
  | "tenants"
  | "meters"
  | "invoices"
  | "payments"
  | "reports"
  | "settings";

export type UploadResult = {
  url: string;
  publicId?: string;
  assetId?: string;
  version?: number;
  width?: number;
  height?: number;
};

export const statusText: Record<Invoice["status"], string> = {
  draft: "ร่าง",
  issued: "รอชำระ",
  partial: "จ่ายบางส่วน",
  paid: "จ่ายครบ",
  overdue: "เกินกำหนด",
  void: "ยกเลิก",
};

export const statusClass: Record<Invoice["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-[var(--tone-info-soft)] text-[var(--tone-info)]",
  partial: "bg-[var(--tone-warn-soft)] text-[var(--tone-warn)]",
  paid: "bg-[var(--tone-ok-soft)] text-[var(--tone-ok)]",
  overdue: "bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]",
  void: "bg-muted text-muted-foreground",
};

export const methodText: Record<Payment["method"], string> = {
  cash: "เงินสด",
  bank_transfer: "โอนธนาคาร",
  promptpay: "พร้อมเพย์",
  other: "อื่น ๆ",
};

export const cycleStatusText: Record<BillingCycle["status"], string> = {
  draft: "ร่าง",
  open: "เปิดใช้งาน",
  closed: "ปิดแล้ว",
};

export const cycleStatusClass: Record<BillingCycle["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-[var(--tone-ok-soft)] text-[var(--tone-ok)]",
  closed: "bg-muted text-muted-foreground",
};

export function tabHref(tab: WorkspaceTab) {
  return tab === "overview" ? "/" : `/?tab=${tab}`;
}

export type FormSource = HTMLFormElement | FormData;

export function field(form: FormSource, name: string) {
  const formData = form instanceof FormData ? form : new FormData(form);
  return String(formData.get(name) ?? "").trim();
}

export function amountField(form: FormSource, name: string) {
  return Number(field(form, name).replace(/,/g, "")) || 0;
}

export type FuelTripFormRow = {
  id: string;
  date: string;
  label: string;
  quantity: string;
  unitPrice: string;
};

export type FuelTripPayloadItem = {
  date: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceEditFormRow = {
  id: string;
  itemId?: string;
  type: InvoiceType;
  description: string;
  quantity: string;
  unitPrice: string;
  meterReadingId?: string;
};

export type InvoiceEditPayloadItem = {
  type: InvoiceType;
  description: string;
  quantity: number;
  unitPrice: number;
  meterReadingId?: string;
};

export const editableInvoiceTypes: InvoiceType[] = [
  "rent",
  "electricity",
  "fuel_transport",
  "other",
];

export const sampleTenantsForDemo: Tenant[] = [
  {
    id: "tenant-bnt",
    code: "BNT",
    name: "บริษัท บีเอ็นที เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    contactName: "",
    taxId: "0505562019812",
    phone: "",
    email: "",
    billingAddress:
      "เลขที่ 8 หมู่ที่ 4 ตำบลหนองป่าครั่ง\nอำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50000",
    vatEnabled: true,
    status: "active",
  },
  {
    id: "tenant-lazada",
    code: "LAZADA",
    name: "บริษัท ลาซาด้า เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    contactName: "",
    taxId: "0-1055-58080-77-8",
    phone: "",
    email: "",
    billingAddress:
      "689 อาคารภิรัช ชั้นที่ 29 ห้องเลขที่ 2904-2906 ซ.สุขุมวิท 35\nถ.สุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",
    vatEnabled: true,
    status: "active",
  },
  {
    id: "tenant-flash",
    code: "FLASH",
    name: "บริษัท แฟลช เอ็กซ์เพรส จำกัด สำนักงานใหญ่",
    contactName: "",
    taxId: "0105560159254",
    phone: "",
    email: "",
    billingAddress:
      "เลขที่ 161 อาคารยูนิลีเวอร์ เฮ้าส์ ชั้นที่ 7 และ 8 ถนนพระรามเก้า\nแขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310",
    vatEnabled: true,
    status: "active",
  },
  {
    id: "tenant-taifah",
    code: "TAIFAH",
    name: "หจก. ใต้ฟ้าปิโตรเลียม",
    contactName: "",
    taxId: "",
    phone: "",
    email: "",
    billingAddress: "",
    vatEnabled: true,
    status: "active",
  },
  {
    id: "tenant-daopaisaan",
    code: "DAOPAISAAN",
    name: "ดาวไพศาล",
    contactName: "",
    taxId: "",
    phone: "",
    email: "",
    billingAddress: "",
    vatEnabled: true,
    status: "active",
  },
];

export function createFuelTripRow(defaultDate: string, index: number): FuelTripFormRow {
  return {
    id: createId("fuel-trip"),
    date: defaultDate,
    label: `รอบวิ่ง ${index + 1}`,
    quantity: "1",
    unitPrice: "0",
  };
}

export function normalizeFuelTripRows(rows: FuelTripFormRow[]): FuelTripPayloadItem[] {
  return rows.map((row, index) => {
    const quantity = Math.max(Math.round(Number(row.quantity) || 1), 1);
    const unitPrice = Number(String(row.unitPrice).replace(/,/g, "")) || 0;

    return {
      date: row.date,
      label: row.label.trim() || `รอบวิ่ง ${index + 1}`,
      quantity,
      unitPrice,
    };
  });
}

export function createInvoiceEditRow(item?: InvoiceItem): InvoiceEditFormRow {
  return {
    id: createId("invoice-edit-row"),
    itemId: item?.id,
    type:
      item?.type && editableInvoiceTypes.includes(item.type)
        ? item.type
        : "other",
    description: item?.description ?? "",
    quantity: String(item?.quantity ?? 1),
    unitPrice: String(item?.unitPrice ?? 0),
    meterReadingId: item?.meterReadingId,
  };
}

export function normalizeInvoiceEditRows(
  rows: InvoiceEditFormRow[],
): InvoiceEditPayloadItem[] {
  return rows.map((row) => ({
    type: row.type,
    description: row.description.trim(),
    quantity: Math.max(Math.round(Number(row.quantity) || 1), 1),
    unitPrice: Number(String(row.unitPrice).replace(/,/g, "")) || 0,
    meterReadingId: row.meterReadingId,
  }));
}

export function invoiceEditItemsFromJson(value: string): InvoiceItem[] {
  if (!value) return [];

  try {
    const rows = JSON.parse(value) as InvoiceEditPayloadItem[];

    if (!Array.isArray(rows)) return [];

    return rows
      .map((row): InvoiceItem | null => {
        const description = row.description?.trim();
        const quantity = Math.max(Math.round(Number(row.quantity) || 1), 1);
        const unitPrice = Number(row.unitPrice) || 0;
        const type = editableInvoiceTypes.includes(row.type) ? row.type : "other";

        if (!description || unitPrice <= 0) return null;

        return {
          id: createId("item"),
          type,
          description,
          quantity,
          unitPrice,
          amount: quantity * unitPrice,
          meterReadingId: row.meterReadingId,
        };
      })
      .filter((item): item is InvoiceItem => Boolean(item));
  } catch {
    return [];
  }
}

export function inferInvoiceType(items: InvoiceItem[], fallback: InvoiceType): InvoiceType {
  const uniqueTypes = new Set(items.map((item) => item.type));
  if (uniqueTypes.size === 1) return items[0]?.type ?? fallback;
  return "mixed";
}

export function fuelTripItemsFromJson(value: string): InvoiceItem[] {
  if (!value) return [];

  try {
    const rows = JSON.parse(value) as FuelTripPayloadItem[];

    if (!Array.isArray(rows)) return [];

    return rows
      .map((row, index): InvoiceItem => {
        const quantity = Math.max(Math.round(Number(row.quantity) || 1), 1);
        const unitPrice = Number(row.unitPrice) || 0;
        const tripLabel = row.label?.trim() || `รอบวิ่ง ${index + 1}`;
        const tripDate = row.date ? formatBillingDate(row.date) : "";

        return {
          id: createId("item"),
          type: "fuel_transport",
          description: ["ค่าขนส่งน้ำมัน", tripLabel, tripDate]
            .filter(Boolean)
            .join(" "),
          quantity,
          unitPrice,
          amount: quantity * unitPrice,
        };
      })
      .filter((item) => item.unitPrice > 0);
  } catch {
    return [];
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function dateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

export function cycleLabel(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(value);
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

export function getTenant(data: DashboardData, tenantId: string) {
  return data.tenants.find((tenant) => tenant.id === tenantId);
}

export function getUnit(data: DashboardData, unitId: string) {
  return data.units.find((unit) => unit.id === unitId);
}

export function invoiceStatusBadge(status: Invoice["status"]) {
  return (
    <Badge className={cn("rounded-sm px-2 py-1", statusClass[status])}>
      {statusText[status]}
    </Badge>
  );
}

export function invoiceTypeBadge(type: Invoice["type"]) {
  return (
    <Badge variant="outline" className="rounded-sm px-2 py-1">
      {formatInvoiceType(type)}
    </Badge>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder = "",
  step,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={step}
        required={required}
        className="flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

export function PrintButton({ href }: { href: string }) {
  return (
    <Button asChild size="sm" variant="outline" className="h-8">
      <a href={href} target="_blank" rel="noreferrer">
        <Printer className="size-4" />
        พิมพ์ PDF
      </a>
    </Button>
  );
}
import { Printer } from "lucide-react";
