"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertCircle,
  Banknote,
  BarChart3,
  Bolt,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Gauge,
  ImageUp,
  Layers,
  Link2,
  Mail,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent,
  useMemo,
  useState,
} from "react";
import {
  createBillingCycleAction,
  createInvoiceForUnitAction,
  createTenantAction,
  generateBatchInvoicesAction,
  importSampleTenantsAction,
  recordMeterReadingAction,
  recordPaymentAction,
  sendInvoiceReminderEmailAction,
  updateBillingCycleStatusAction,
  createTenantPortalLinkAction,
  revokeTenantPortalLinkAction,
  sendInvoiceEmailAction,
  sendReceiptEmailAction,
  updateInvoiceAction,
  updateOrganizationAction,
  updateTenantAction,
  updateUnitAction,
  updateUserRoleAction,
  voidInvoiceAction,
  voidPaymentAction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  formatCurrency,
  formatDate,
  formatInvoiceType,
  formatNumber,
  hasMeterImage,
  nextRunningNo,
} from "@/lib/billing";
import type {
  DashboardData,
  BillingCycle,
  Invoice,
  InvoiceItem,
  InvoiceType,
  MeterReading,
  Payment,
  RentalUnit,
  Tenant,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type WorkspaceTab =
  | "overview"
  | "cycles"
  | "tenants"
  | "meters"
  | "invoices"
  | "payments"
  | "reports"
  | "settings";

type UploadResult = {
  url: string;
  publicId?: string;
  assetId?: string;
  version?: number;
  width?: number;
  height?: number;
};

const statusText: Record<Invoice["status"], string> = {
  draft: "ร่าง",
  issued: "รอชำระ",
  partial: "จ่ายบางส่วน",
  paid: "จ่ายครบ",
  overdue: "เกินกำหนด",
  void: "ยกเลิก",
};

const statusClass: Record<Invoice["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-[var(--tone-info-soft)] text-[var(--tone-info)]",
  partial: "bg-[var(--tone-warn-soft)] text-[var(--tone-warn)]",
  paid: "bg-[var(--tone-ok-soft)] text-[var(--tone-ok)]",
  overdue: "bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]",
  void: "bg-muted text-muted-foreground",
};

const methodText: Record<Payment["method"], string> = {
  cash: "เงินสด",
  bank_transfer: "โอนธนาคาร",
  promptpay: "พร้อมเพย์",
  other: "อื่น ๆ",
};

const cycleStatusText: Record<BillingCycle["status"], string> = {
  draft: "ร่าง",
  open: "เปิดใช้งาน",
  closed: "ปิดแล้ว",
};

const cycleStatusClass: Record<BillingCycle["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-[var(--tone-ok-soft)] text-[var(--tone-ok)]",
  closed: "bg-muted text-muted-foreground",
};

const workspaceTabs: Array<{
  value: WorkspaceTab;
  label: string;
  icon: typeof FileText;
}> = [
  { value: "overview", label: "ภาพรวม", icon: FileText },
  { value: "cycles", label: "รอบบิล", icon: CalendarDays },
  { value: "tenants", label: "ผู้เช่า", icon: Users },
  { value: "meters", label: "มิเตอร์", icon: Gauge },
  { value: "invoices", label: "ใบแจ้งหนี้", icon: ReceiptText },
  { value: "payments", label: "ชำระเงิน", icon: Banknote },
  { value: "reports", label: "รายงาน", icon: BarChart3 },
  { value: "settings", label: "ตั้งค่า", icon: Settings },
];

function tabHref(tab: WorkspaceTab) {
  return tab === "overview" ? "/" : `/?tab=${tab}`;
}

type FormSource = HTMLFormElement | FormData;

function field(form: FormSource, name: string) {
  const formData = form instanceof FormData ? form : new FormData(form);
  return String(formData.get(name) ?? "").trim();
}

function amountField(form: FormSource, name: string) {
  return Number(field(form, name).replace(/,/g, "")) || 0;
}

type FuelTripFormRow = {
  id: string;
  date: string;
  label: string;
  quantity: string;
  unitPrice: string;
};

type FuelTripPayloadItem = {
  date: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

type InvoiceEditFormRow = {
  id: string;
  itemId?: string;
  type: InvoiceType;
  description: string;
  quantity: string;
  unitPrice: string;
  meterReadingId?: string;
};

type InvoiceEditPayloadItem = {
  type: InvoiceType;
  description: string;
  quantity: number;
  unitPrice: number;
  meterReadingId?: string;
};

const editableInvoiceTypes: InvoiceType[] = [
  "rent",
  "electricity",
  "fuel_transport",
  "other",
];

const sampleTenantsForDemo: Tenant[] = [
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

function createFuelTripRow(defaultDate: string, index: number): FuelTripFormRow {
  return {
    id: createId("fuel-trip"),
    date: defaultDate,
    label: `รอบวิ่ง ${index + 1}`,
    quantity: "1",
    unitPrice: "0",
  };
}

function normalizeFuelTripRows(rows: FuelTripFormRow[]): FuelTripPayloadItem[] {
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

function createInvoiceEditRow(item?: InvoiceItem): InvoiceEditFormRow {
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

function normalizeInvoiceEditRows(
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

function invoiceEditItemsFromJson(value: string): InvoiceItem[] {
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

function inferInvoiceType(items: InvoiceItem[], fallback: InvoiceType): InvoiceType {
  const uniqueTypes = new Set(items.map((item) => item.type));
  if (uniqueTypes.size === 1) return items[0]?.type ?? fallback;
  return "mixed";
}

function fuelTripItemsFromJson(value: string): InvoiceItem[] {
  if (!value) return [];

  try {
    const rows = JSON.parse(value) as FuelTripPayloadItem[];

    if (!Array.isArray(rows)) return [];

    return rows
      .map((row, index): InvoiceItem => {
        const quantity = Math.max(Math.round(Number(row.quantity) || 1), 1);
        const unitPrice = Number(row.unitPrice) || 0;
        const tripLabel = row.label?.trim() || `รอบวิ่ง ${index + 1}`;
        const tripDate = row.date ? formatDate(row.date) : "";

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function cycleLabel(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function getTenant(data: DashboardData, tenantId: string) {
  return data.tenants.find((tenant) => tenant.id === tenantId);
}

function getUnit(data: DashboardData, unitId: string) {
  return data.units.find((unit) => unit.id === unitId);
}

function invoiceStatusBadge(status: Invoice["status"]) {
  return (
    <Badge className={cn("rounded-sm px-2 py-1", statusClass[status])}>
      {statusText[status]}
    </Badge>
  );
}

function invoiceTypeBadge(type: Invoice["type"]) {
  return (
    <Badge variant="outline" className="rounded-sm px-2 py-1">
      {formatInvoiceType(type)}
    </Badge>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function BillingWorkspace({
  initialData,
  initialTab = "overview",
}: {
  initialData: DashboardData;
  initialTab?: WorkspaceTab;
}) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [tenantOpen, setTenantOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [fuelTransportOpen, setFuelTransportOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const router = useRouter();

  const sortedCycles = useMemo(
    () =>
      [...data.cycles].sort(
        (a, b) =>
          new Date(b.periodStart).getTime() -
          new Date(a.periodStart).getTime(),
      ),
    [data.cycles],
  );
  const defaultCycleId =
    sortedCycles.find((cycle) => cycle.status === "open")?.id ??
    sortedCycles[0]?.id ??
    "";
  const [selectedCycleId, setSelectedCycleId] = useState(defaultCycleId);
  const activeCycle =
    data.cycles.find((cycle) => cycle.id === selectedCycleId) ??
    data.cycles.find((cycle) => cycle.id === defaultCycleId) ??
    null;
  const tabTriggerClass = "h-8 min-w-0 px-2 text-xs sm:text-sm";

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", tabHref(tab));
    }
  };

  const handleTabLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    tab: WorkspaceTab,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    selectTab(tab);
  };

  const cycleInvoices = useMemo(
    () =>
      activeCycle
        ? data.invoices.filter((invoice) => invoice.cycleId === activeCycle.id)
        : [],
    [activeCycle, data.invoices],
  );
  const cycleReadings = useMemo(
    () =>
      activeCycle
        ? data.meterReadings.filter(
            (reading) => reading.cycleId === activeCycle.id,
          )
        : [],
    [activeCycle, data.meterReadings],
  );
  const cyclePayments = useMemo(
    () =>
      data.payments.filter((payment) =>
        cycleInvoices.some((invoice) => invoice.id === payment.invoiceId),
      ),
    [cycleInvoices, data.payments],
  );

  const filteredTenants = useMemo(() => {
    const query = search.toLowerCase();
    if (!query) return data.tenants;

    return data.tenants.filter((tenant) =>
      [tenant.code, tenant.name, tenant.contactName, tenant.phone, tenant.email]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [data.tenants, search]);

  const totals = useMemo(() => {
    const openInvoices = cycleInvoices.filter((invoice) =>
      ["issued", "partial", "overdue"].includes(invoice.status),
    );
    const outstanding = openInvoices.reduce(
      (sum, invoice) => sum + invoice.balance,
      0,
    );
    const paidThisCycle = cyclePayments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const electricUsage = cycleReadings.reduce(
      (sum, reading) => sum + reading.usageUnits,
      0,
    );

    return {
      outstanding,
      paidThisCycle,
      electricUsage,
      openInvoiceCount: openInvoices.length,
    };
  }, [cycleInvoices, cyclePayments, cycleReadings]);

  async function uploadMeterImage(file: File): Promise<UploadResult> {
    if (!data.cloudinaryConfigured) {
      if (data.databaseConfigured) {
        throw new Error("ยังไม่ได้ตั้งค่า Cloudinary จึงเก็บรูปมิเตอร์จริงไม่ได้");
      }

      return {
        url: URL.createObjectURL(file),
      };
    }

    const signResponse = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!signResponse.ok) {
      const response = (await signResponse.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(response?.message ?? "อัปโหลดรูปไม่ได้");
    }

    const signed = (await signResponse.json()) as {
      cloudName: string;
      apiKey: string;
      signature: string;
      params: Record<string, string | number | boolean>;
    };

    const uploadForm = new FormData();
    uploadForm.set("file", file);
    uploadForm.set("api_key", signed.apiKey);
    uploadForm.set("signature", signed.signature);

    for (const [key, value] of Object.entries(signed.params)) {
      uploadForm.set(key, String(value));
    }

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      {
        method: "POST",
        body: uploadForm,
      },
    );

    if (!uploadResponse.ok) {
      throw new Error("Cloudinary ปฏิเสธไฟล์นี้");
    }

    const result = (await uploadResponse.json()) as {
      secure_url: string;
      public_id: string;
      asset_id: string;
      version: number;
      width: number;
      height: number;
    };

    return {
      url: result.secure_url,
      publicId: result.public_id,
      assetId: result.asset_id,
      version: result.version,
      width: result.width,
      height: result.height,
    };
  }

  async function handleUpload(file?: File) {
    if (!file) return;

    setIsUploading(true);
    setUploadMessage("");

    try {
      const result = await uploadMeterImage(file);
      setUploadResult(result);
      setUploadMessage(
        data.cloudinaryConfigured
          ? "อัปโหลดรูปเข้า Cloudinary แล้ว"
          : "แสดงรูปตัวอย่างในโหมด demo",
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTenantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (data.databaseConfigured) {
      const result = await createTenantAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        setTenantOpen(false);
        router.refresh();
      }
      return;
    }

    const tenant: Tenant = {
      id: createId("tenant"),
      code: field(form, "code") || `T-${String(data.tenants.length + 1).padStart(3, "0")}`,
      name: field(form, "name"),
      contactName: field(form, "contactName"),
      taxId: field(form, "taxId"),
      phone: field(form, "phone"),
      email: field(form, "email"),
      billingAddress: field(form, "billingAddress"),
      vatEnabled: field(form, "vatEnabled") === "yes",
      status: "active",
      notes: field(form, "notes"),
    };

    if (!tenant.name) return;

    setData((current) => ({
      ...current,
      tenants: [tenant, ...current.tenants],
    }));
    form.reset();
    setTenantOpen(false);
  }

  async function handleImportSampleTenants() {
    if (!data.databaseConfigured) {
      setData((current) => {
        const existingCodes = new Set(
          current.tenants.map((tenant) => tenant.code),
        );
        const newTenants = sampleTenantsForDemo.filter(
          (tenant) => !existingCodes.has(tenant.code),
        );

        return {
          ...current,
          tenants: [...current.tenants, ...newTenants],
        };
      });
      setActionMessage("เพิ่มลูกค้าจากตัวอย่างแล้ว");
      return;
    }

    const result = await importSampleTenantsAction();
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleRentInvoiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนออกใบแจ้งหนี้");
      return;
    }

    if (data.databaseConfigured) {
      const result = await createInvoiceForUnitAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        setRentOpen(false);
        setFuelTransportOpen(false);
        router.refresh();
      }
      return;
    }

    const invoiceType: InvoiceType =
      field(form, "type") === "fuel_transport" ? "fuel_transport" : "rent";
    const unit = getUnit(data, field(form, "unitId"));
    const tenantId = invoiceType === "rent" ? unit?.tenantId : field(form, "tenantId");
    const tenant = tenantId ? getTenant(data, tenantId) : undefined;
    const unitPrice =
      invoiceType === "rent"
        ? amountField(form, "rentAmount") || unit?.rentAmount || 0
        : amountField(form, "unitPrice");
    const fuelTripItems =
      invoiceType === "fuel_transport"
        ? fuelTripItemsFromJson(field(form, "itemsJson"))
        : [];

    if (
      !tenantId ||
      !tenant ||
      (invoiceType === "rent" && unitPrice <= 0) ||
      (invoiceType === "fuel_transport" && !fuelTripItems.length)
    ) {
      return;
    }

    const rentItem: InvoiceItem = {
      id: createId("item"),
      type: invoiceType,
      description:
        field(form, "description") ||
        `ค่าเช่าพื้นที่ ${unit?.code ?? ""}`,
      quantity: 1,
      unitPrice,
      amount: unitPrice,
    };
    const items = invoiceType === "fuel_transport" ? fuelTripItems : [rentItem];
    const totalsForInvoice = calculateInvoiceTotals({
      items,
      discount: amountField(form, "discount"),
      vatEnabled: field(form, "vatEnabled") === "yes",
      vatRate: data.organization.vatRate,
    });
    const invoice: Invoice = {
      id: createId("invoice"),
      tenantId,
      cycleId: activeCycle.id,
      invoiceNo: nextRunningNo("INV-256905", data.invoices.length),
      type: invoiceType,
      issueDate: today(),
      dueDate: field(form, "dueDate") || activeCycle.dueDate,
      items,
      vatEnabled: field(form, "vatEnabled") === "yes",
      status: "issued",
      notes:
        invoiceType === "fuel_transport"
          ? field(form, "description")
          : tenant
            ? `ผู้เช่า ${tenant.name}`
            : "",
      ...totalsForInvoice,
    };

    setData((current) => ({
      ...current,
      invoices: [invoice, ...current.invoices],
    }));
    form.reset();
    setRentOpen(false);
    setFuelTransportOpen(false);
  }

  async function handleInvoiceUpdate(formData: FormData) {
    const invoiceId = field(formData, "invoiceId");
    const items = invoiceEditItemsFromJson(field(formData, "itemsJson"));

    if (!invoiceId || !items.length) {
      setActionMessage("ต้องมีรายการในใบแจ้งหนี้อย่างน้อย 1 รายการ");
      return false;
    }

    if (!data.databaseConfigured) {
      setData((current) => ({
        ...current,
        invoices: current.invoices.map((invoice) => {
          if (invoice.id !== invoiceId) return invoice;

          const totalsForInvoice = calculateInvoiceTotals({
            items,
            discount: amountField(formData, "discount"),
            vatEnabled: field(formData, "vatEnabled") === "yes",
            vatRate: data.organization.vatRate,
          });
          const dueDate = field(formData, "dueDate") || invoice.dueDate;
          const status = deriveInvoiceStatus({
            total: totalsForInvoice.total,
            paid: invoice.paid,
            dueDate,
            issued: true,
          });

          return {
            ...invoice,
            tenantId: field(formData, "tenantId") || invoice.tenantId,
            dueDate,
            items,
            type: inferInvoiceType(items, invoice.type),
            notes: field(formData, "notes"),
            vatEnabled: field(formData, "vatEnabled") === "yes",
            status,
            ...totalsForInvoice,
            paid: invoice.paid,
            balance: Math.max(totalsForInvoice.total - invoice.paid, 0),
          };
        }),
      }));
      setActionMessage("แก้ไขใบแจ้งหนี้แล้ว");
      return true;
    }

    const result = await updateInvoiceAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
    return result.ok;
  }

  async function handleMeterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนบันทึกมิเตอร์");
      return;
    }

    if (!uploadResult) {
      setActionMessage("ต้องแนบรูปมิเตอร์ก่อนบันทึกเลขมิเตอร์");
      return;
    }

    if (
      data.databaseConfigured &&
      (!uploadResult.publicId || !uploadResult.url.startsWith("https://"))
    ) {
      setActionMessage("ต้องอัปโหลดรูปเข้า Cloudinary ก่อนบันทึกมิเตอร์");
      return;
    }

    if (data.databaseConfigured) {
      const result = await recordMeterReadingAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        setUploadResult(null);
        setUploadMessage("");
        form.reset();
        setMeterOpen(false);
        router.refresh();
      }
      return;
    }

    const unit = getUnit(data, field(form, "unitId"));
    if (!unit) return;

    const previousReading = amountField(form, "previousReading");
    const currentReading = amountField(form, "currentReading");
    const rate = amountField(form, "rate") || unit.electricRate;
    const calculation = calculateElectricityCharge({
      previousReading,
      currentReading,
      rate,
    });
    const reading: MeterReading = {
      id: createId("reading"),
      unitId: unit.id,
      tenantId: unit.tenantId,
      cycleId: activeCycle.id,
      previousReading,
      currentReading,
      usageUnits: calculation.usageUnits,
      rate,
      amount: calculation.amount,
      capturedAt: new Date().toISOString(),
      imageUrl: uploadResult.url,
      cloudinaryPublicId: uploadResult?.publicId,
      cloudinaryAssetId: uploadResult?.assetId,
      cloudinaryVersion: uploadResult?.version,
      warning: calculation.warning,
    };

    const createInvoice = field(form, "createInvoice") === "yes";
    const invoice = createInvoice
      ? createElectricInvoice(data, reading, unit)
      : undefined;

    setData((current) => ({
      ...current,
      meterReadings: [reading, ...current.meterReadings],
      invoices: invoice ? [invoice, ...current.invoices] : current.invoices,
    }));
    setUploadResult(null);
    setUploadMessage("");
    form.reset();
    setMeterOpen(false);
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (data.databaseConfigured) {
      const result = await recordPaymentAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        setPaymentOpen(false);
        router.refresh();
      }
      return;
    }

    const invoiceId = field(form, "invoiceId");
    const invoice = data.invoices.find((item) => item.id === invoiceId);
    const amount = amountField(form, "amount");
    if (!invoice || amount <= 0) return;

    const payment: Payment = {
      id: createId("payment"),
      invoiceId,
      receiptNo: nextRunningNo("RCPT-256905", data.payments.length),
      paidAt: field(form, "paidAt") || today(),
      amount,
      method: (field(form, "method") as Payment["method"]) || "bank_transfer",
      provider: "manual",
      providerSessionId: "",
      providerPaymentId: "",
      webhookEventId: "",
      refundStatus: "none",
      reference: field(form, "reference"),
      notes: field(form, "notes"),
    };

    setData((current) => ({
      ...current,
      payments: [payment, ...current.payments],
      invoices: current.invoices.map((item) => {
        if (item.id !== invoiceId) return item;

        const paid = item.paid + amount;
        const balance = Math.max(item.total - paid, 0);

        return {
          ...item,
          paid,
          balance,
          status: deriveInvoiceStatus({
            total: item.total,
            paid,
            dueDate: item.dueDate,
            issued: true,
          }),
        };
      }),
    }));
    form.reset();
    setPaymentOpen(false);
  }

  async function handleCycleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (data.databaseConfigured) {
      const result = await createBillingCycleAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        setCycleOpen(false);
        router.refresh();
      }
      return;
    }

    const periodStart = field(form, "periodStart");
    const periodEnd = field(form, "periodEnd");
    const dueDate = field(form, "dueDate");
    const status = (field(form, "status") || "open") as BillingCycle["status"];

    if (!periodStart || !periodEnd || !dueDate) return;

    const cycle: BillingCycle = {
      id: createId("cycle"),
      label: field(form, "label") || cycleLabel(new Date(periodStart)),
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      status,
    };

    setData((current) => ({
      ...current,
      cycles: [
        cycle,
        ...current.cycles.map((item) =>
          status === "open" && item.status === "open"
            ? { ...item, status: "closed" as const }
            : item,
        ),
      ],
    }));
    setSelectedCycleId(cycle.id);
    form.reset();
    setCycleOpen(false);
  }

  async function handleCycleStatusChange(
    cycleId: string,
    status: BillingCycle["status"],
  ) {
    const formData = new FormData();
    formData.set("cycleId", cycleId);
    formData.set("status", status);

    if (data.databaseConfigured) {
      const result = await updateBillingCycleStatusAction(
        { ok: false, message: "" },
        formData,
      );
      setActionMessage(result.message);
      if (result.ok) {
        if (status === "open") setSelectedCycleId(cycleId);
        router.refresh();
      }
      return;
    }

    setData((current) => ({
      ...current,
      cycles: current.cycles.map((cycle) => {
        if (cycle.id === cycleId) return { ...cycle, status };
        if (status === "open" && cycle.status === "open") {
          return { ...cycle, status: "closed" };
        }
        return cycle;
      }),
    }));
    if (status === "open") setSelectedCycleId(cycleId);
    setActionMessage("อัปเดตรอบบิลแล้ว");
  }

  async function handleBatchInvoices() {
    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนสร้างใบแจ้งหนี้ยกชุด");
      return;
    }

    if (data.databaseConfigured) {
      const formData = new FormData();
      formData.set("billingCycleId", activeCycle.id);
      const result = await generateBatchInvoicesAction(
        { ok: false, message: "" },
        formData,
      );
      setActionMessage(result.message);
      if (result.ok) router.refresh();
      return;
    }

    let createdCount = 0;
    let skippedExisting = 0;
    let skippedNoTenant = 0;
    let missingMeter = 0;
    let missingMeterImage = 0;

    setData((current) => {
      const cycle = current.cycles.find((item) => item.id === activeCycle.id);
      if (!cycle || cycle.status === "closed") return current;

      const existingTenantIds = new Set(
        current.invoices
          .filter((invoice) => invoice.cycleId === cycle.id)
          .map((invoice) => invoice.tenantId),
      );
      const latestReadingByUnit = new Map<string, MeterReading>();

      for (const reading of current.meterReadings.filter(
        (item) => item.cycleId === cycle.id,
      )) {
        const existing = latestReadingByUnit.get(reading.unitId);
        if (
          !existing ||
          new Date(reading.capturedAt).getTime() >
            new Date(existing.capturedAt).getTime()
        ) {
          latestReadingByUnit.set(reading.unitId, reading);
        }
      }

      const prefix = `INV-${new Date(cycle.periodStart).getFullYear() + 543}${String(new Date(cycle.periodStart).getMonth() + 1).padStart(2, "0")}`;
      const newInvoices: Invoice[] = [];

      for (const unit of current.units.filter(
        (item) => item.status === "occupied",
      )) {
        if (!unit.tenantId) {
          skippedNoTenant += 1;
          continue;
        }

        if (existingTenantIds.has(unit.tenantId)) {
          skippedExisting += 1;
          continue;
        }

        const tenant = getTenant(current, unit.tenantId);
        if (!tenant) {
          skippedNoTenant += 1;
          continue;
        }

        const reading = latestReadingByUnit.get(unit.id);
        if (!reading) {
          missingMeter += 1;
          continue;
        }

        if (!hasMeterImage(reading)) {
          missingMeterImage += 1;
          continue;
        }

        const items: InvoiceItem[] = [
          {
            id: createId("item"),
            type: "rent",
            description: `ค่าเช่าพื้นที่ ${unit.code} รอบ ${cycle.label}`,
            quantity: 1,
            unitPrice: unit.rentAmount,
            amount: unit.rentAmount,
          },
        ];

        items.push({
          id: createId("item"),
          type: "electricity",
          description: `ค่าไฟพื้นที่ ${unit.code} ${formatNumber(reading.usageUnits)} หน่วย`,
          quantity: reading.usageUnits,
          unitPrice: reading.rate,
          amount: reading.amount,
          meterReadingId: reading.id,
        });

        const totalsForInvoice = calculateInvoiceTotals({
          items,
          vatEnabled: tenant.vatEnabled,
          vatRate: current.organization.vatRate,
        });

        if (totalsForInvoice.total <= 0) continue;

        newInvoices.push({
          id: createId("invoice"),
          tenantId: tenant.id,
          cycleId: cycle.id,
          invoiceNo: nextRunningNo(
            prefix,
            current.invoices.length + newInvoices.length,
          ),
          type: "mixed",
          issueDate: today(),
          dueDate: cycle.dueDate,
          items,
          vatEnabled: tenant.vatEnabled,
          status: "issued",
          ...totalsForInvoice,
        });
        existingTenantIds.add(tenant.id);
        createdCount += 1;
      }

      return {
        ...current,
        invoices: [...newInvoices, ...current.invoices],
      };
    });

    setActionMessage(
      createdCount
        ? `สร้างใบแจ้งหนี้ ${createdCount} ใบ ข้ามซ้ำ ${skippedExisting} ห้อง ไม่มีผู้เช่า ${skippedNoTenant} ห้อง ไม่มีเลขไฟ ${missingMeter} ห้อง ไม่มีรูปมิเตอร์ ${missingMeterImage} ห้อง`
        : `ยังไม่มีรายการที่สร้างได้ในรอบบิลนี้ ไม่มีเลขไฟ ${missingMeter} ห้อง ไม่มีรูปมิเตอร์ ${missingMeterImage} ห้อง`,
    );
  }

  async function handleTenantUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!data.databaseConfigured) {
      setData((current) => ({
        ...current,
        tenants: current.tenants.map((tenant) =>
          tenant.id === field(form, "tenantId")
            ? {
                ...tenant,
                code: field(form, "code"),
                name: field(form, "name"),
                contactName: field(form, "contactName"),
                phone: field(form, "phone"),
                email: field(form, "email"),
                taxId: field(form, "taxId"),
                billingAddress: field(form, "billingAddress"),
                vatEnabled: field(form, "vatEnabled") === "yes",
              }
            : tenant,
        ),
      }));
      setActionMessage("แก้ไขผู้เช่าแล้ว");
      return;
    }

    const result = await updateTenantAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleUnitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!data.databaseConfigured) {
      setActionMessage("โหมด demo ยังไม่บันทึกพื้นที่เช่า");
      return;
    }

    const result = await updateUnitAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleOrganizationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!data.databaseConfigured) {
      setData((current) => ({
        ...current,
        organization: {
          ...current.organization,
          name: field(form, "name"),
          taxId: field(form, "taxId"),
          address: field(form, "address"),
          phone: field(form, "phone"),
          email: field(form, "email"),
          bankAccountName: field(form, "bankAccountName"),
          bankAccountNumber: field(form, "bankAccountNumber"),
          bankName: field(form, "bankName"),
          bankBranch: field(form, "bankBranch"),
          paymentLineId: field(form, "paymentLineId"),
          vatRate: amountField(form, "vatRate"),
          vatEnabledDefault: field(form, "vatEnabledDefault") === "yes",
        },
      }));
      setActionMessage("แก้ไขข้อมูลบริษัทแล้ว");
      return;
    }

    const result = await updateOrganizationAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleRoleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await updateUserRoleAction(
      { ok: false, message: "" },
      new FormData(event.currentTarget),
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handlePortalLink(tenantId: string) {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    const result = await createTenantPortalLinkAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleRevokePortalLink(linkId: string) {
    const formData = new FormData();
    formData.set("linkId", linkId);
    const result = await revokeTenantPortalLinkAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleSendInvoice(invoiceId: string) {
    const formData = new FormData();
    formData.set("invoiceId", invoiceId);
    const result = await sendInvoiceEmailAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleSendReminder(invoiceId: string) {
    const formData = new FormData();
    formData.set("invoiceId", invoiceId);
    const result = await sendInvoiceReminderEmailAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleSendReceipt(paymentId: string) {
    const formData = new FormData();
    formData.set("paymentId", paymentId);
    const result = await sendReceiptEmailAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleVoidInvoice(invoiceId: string) {
    const reason = window.prompt("เหตุผลยกเลิกใบแจ้งหนี้");
    if (!reason) return;
    const formData = new FormData();
    formData.set("invoiceId", invoiceId);
    formData.set("reason", reason);
    const result = await voidInvoiceAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  async function handleVoidPayment(paymentId: string) {
    const reason = window.prompt("เหตุผลยกเลิกรายการรับเงิน");
    if (!reason) return;
    const formData = new FormData();
    formData.set("paymentId", paymentId);
    formData.set("reason", reason);
    const result = await voidPaymentAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-[1480px] grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-sidebar px-4 py-4 md:min-h-screen md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ReceiptText className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                ระบบใบแจ้งหนี้
              </p>
              <p className="truncate text-xs text-muted-foreground">
                ค่าเช่า ค่าไฟ ค่าขนส่งน้ำมัน
              </p>
            </div>
          </div>

          <nav className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-1">
            {workspaceTabs.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === item.value;

              return (
                <a
                  href={tabHref(item.value)}
                  key={item.value}
                  onClick={(event) => handleTabLinkClick(event, item.value)}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs transition md:justify-start md:text-sm",
                    selected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                  aria-current={selected ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <a
            href={tabHref("settings")}
            onClick={(event) => handleTabLinkClick(event, "settings")}
            className="mt-6 hidden w-full rounded-md border border-border bg-card p-3 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-sidebar-accent md:block"
          >
            <div className="flex items-center gap-2 text-foreground">
              <Building2 className="size-4" />
              <span className="font-medium">{data.organization.name}</span>
            </div>
            <p className="mt-2 leading-6">{data.organization.phone}</p>
            <p>{data.organization.email}</p>
          </a>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                รอบบิล {activeCycle?.label ?? "ยังไม่ได้สร้าง"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                จัดการใบแจ้งหนี้ผู้เช่า
              </h1>
              <div className="mt-3 w-full max-w-xs">
                <Select
                  value={activeCycle?.id ?? ""}
                  onValueChange={setSelectedCycleId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกรอบบิล" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCycles.map((cycle) => (
                      <SelectItem key={cycle.id} value={cycle.id}>
                        {cycle.label} · {cycleStatusText[cycle.status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCycleOpen(true)}
                >
                  <CalendarPlus className="size-4" />
                  รอบบิลใหม่
                </Button>
                <CycleDialog
                  data={data}
                  activeCycle={activeCycle}
                  onSubmit={handleCycleSubmit}
                />
              </Dialog>
              <Button
                variant="outline"
                onClick={handleBatchInvoices}
                disabled={!activeCycle || activeCycle.status === "closed"}
              >
                <Sparkles className="size-4" />
                สร้างบิลยกชุด
              </Button>
              <Dialog open={meterOpen} onOpenChange={setMeterOpen}>
                <Button
                  type="button"
                  disabled={!activeCycle}
                  onClick={() => setMeterOpen(true)}
                >
                  <ImageUp className="size-4" />
                  บันทึกมิเตอร์
                </Button>
                {activeCycle ? (
                  <MeterDialog
                    data={data}
                    activeCycleId={activeCycle.id}
                    isUploading={isUploading}
                    uploadMessage={uploadMessage}
                    uploadResult={uploadResult}
                    onFileChange={handleUpload}
                    onSubmit={handleMeterSubmit}
                  />
                ) : null}
              </Dialog>
              <Dialog open={rentOpen} onOpenChange={setRentOpen}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!activeCycle}
                  onClick={() => setRentOpen(true)}
                >
                  <Plus className="size-4" />
                  ใบค่าเช่า
                </Button>
                {activeCycle ? (
                  <RentInvoiceDialog
                    data={data}
                    activeCycle={activeCycle}
                    onSubmit={handleRentInvoiceSubmit}
                  />
                ) : null}
              </Dialog>
              <Dialog
                open={fuelTransportOpen}
                onOpenChange={setFuelTransportOpen}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={!activeCycle}
                  onClick={() => setFuelTransportOpen(true)}
                >
                  <Truck className="size-4" />
                  ใบขนส่งน้ำมัน
                </Button>
                {activeCycle ? (
                  <FuelTransportInvoiceDialog
                    data={data}
                    activeCycle={activeCycle}
                    onSubmit={handleRentInvoiceSubmit}
                  />
                ) : null}
              </Dialog>
              <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaymentOpen(true)}
                >
                  <CircleDollarSign className="size-4" />
                  รับชำระ
                </Button>
                <PaymentDialog data={data} onSubmit={handlePaymentSubmit} />
              </Dialog>
            </div>
          </header>

          <section className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={ReceiptText}
              label="ยอดค้าง"
              value={formatCurrency(totals.outstanding)}
              note={`${totals.openInvoiceCount} ใบยังไม่ปิด`}
            />
            <MetricCard
              icon={Banknote}
              label="รับชำระแล้ว"
              value={formatCurrency(totals.paidThisCycle)}
              note="รวมจากรายการที่บันทึก"
            />
            <MetricCard
              icon={Bolt}
              label="หน่วยไฟเดือนนี้"
              value={`${formatNumber(totals.electricUsage)} หน่วย`}
              note={`${data.meterReadings.filter(hasMeterImage).length} รูปมิเตอร์`}
            />
            <MetricCard
              icon={Users}
              label="ผู้เช่าใช้งาน"
              value={`${data.tenants.length} ราย`}
              note={`${data.units.length} พื้นที่เช่า`}
            />
          </section>

          <ConfigStrip data={data} />
          {actionMessage ? (
            <div className="mt-3 border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {actionMessage}
            </div>
          ) : null}

          <Tabs
            value={activeTab}
            onValueChange={(value) => selectTab(value as WorkspaceTab)}
            className="mt-5"
          >
            <TabsList className="!grid !h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="overview"
              >
                <a
                  href={tabHref("overview")}
                  onClick={(event) => handleTabLinkClick(event, "overview")}
                >
                  ภาพรวม
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="cycles"
              >
                <a
                  href={tabHref("cycles")}
                  onClick={(event) => handleTabLinkClick(event, "cycles")}
                >
                  รอบบิล
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="tenants"
              >
                <a
                  href={tabHref("tenants")}
                  onClick={(event) => handleTabLinkClick(event, "tenants")}
                >
                  ผู้เช่า
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="meters"
              >
                <a
                  href={tabHref("meters")}
                  onClick={(event) => handleTabLinkClick(event, "meters")}
                >
                  มิเตอร์
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="invoices"
              >
                <a
                  href={tabHref("invoices")}
                  onClick={(event) => handleTabLinkClick(event, "invoices")}
                >
                  ใบแจ้งหนี้
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="payments"
              >
                <a
                  href={tabHref("payments")}
                  onClick={(event) => handleTabLinkClick(event, "payments")}
                >
                  ชำระเงิน
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="reports"
              >
                <a
                  href={tabHref("reports")}
                  onClick={(event) => handleTabLinkClick(event, "reports")}
                >
                  รายงาน
                </a>
              </TabsTrigger>
              <TabsTrigger
                asChild
                className={tabTriggerClass}
                value="settings"
              >
                <a
                  href={tabHref("settings")}
                  onClick={(event) => handleTabLinkClick(event, "settings")}
                >
                  ตั้งค่า
                </a>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" id="ภาพรวม" className="mt-4">
              <OverviewPanel data={data} cycleId={activeCycle?.id ?? ""} />
            </TabsContent>

            <TabsContent value="cycles" id="รอบบิล" className="mt-4">
              <CyclePanel
                data={data}
                activeCycle={activeCycle}
                selectedCycleId={activeCycle?.id ?? ""}
                onSelectCycle={setSelectedCycleId}
                onStatusChange={handleCycleStatusChange}
                onBatchInvoices={handleBatchInvoices}
              />
            </TabsContent>

            <TabsContent value="tenants" id="ผู้เช่า" className="mt-4">
              <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ค้นหาผู้เช่า"
                    className="pl-9"
                  />
                </div>
                <Dialog open={tenantOpen} onOpenChange={setTenantOpen}>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleImportSampleTenants}
                    >
                      <Upload className="size-4" />
                      เติมลูกค้าตัวอย่าง
                    </Button>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Plus className="size-4" />
                        เพิ่มผู้เช่า
                      </Button>
                    </DialogTrigger>
                  </div>
                  <TenantDialog onSubmit={handleTenantSubmit} />
                </Dialog>
              </section>
              <TenantList
                data={data}
                tenants={filteredTenants}
                onCreatePortalLink={handlePortalLink}
                onRevokePortalLink={handleRevokePortalLink}
                onUpdateTenant={handleTenantUpdate}
              />
            </TabsContent>

            <TabsContent value="meters" id="มิเตอร์" className="mt-4">
              <MeterList data={data} cycleId={activeCycle?.id ?? ""} />
            </TabsContent>

            <TabsContent value="invoices" id="ใบแจ้งหนี้" className="mt-4">
              <InvoiceList
                data={data}
                cycleId={activeCycle?.id ?? ""}
                onUpdateInvoice={handleInvoiceUpdate}
                onSendInvoice={handleSendInvoice}
                onSendReminder={handleSendReminder}
                onVoidInvoice={handleVoidInvoice}
              />
            </TabsContent>

            <TabsContent value="payments" id="ชำระเงิน" className="mt-4">
              <PaymentList
                data={data}
                cycleId={activeCycle?.id ?? ""}
                onSendReceipt={handleSendReceipt}
                onVoidPayment={handleVoidPayment}
              />
            </TabsContent>

            <TabsContent value="reports" id="รายงาน" className="mt-4">
              <ReportsPanel data={data} cycleId={activeCycle?.id ?? ""} />
            </TabsContent>

            <TabsContent value="settings" id="ตั้งค่า" className="mt-4">
              <SettingsPanel
                data={data}
                onOrganizationSubmit={handleOrganizationSubmit}
                onRoleSubmit={handleRoleSubmit}
                onUnitSubmit={handleUnitUpdate}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}

function createElectricInvoice(
  data: DashboardData,
  reading: MeterReading,
  unit: RentalUnit,
): Invoice {
  const item: InvoiceItem = {
    id: createId("item"),
    type: "electricity",
    description: `ค่าไฟพื้นที่ ${unit.code} ${formatNumber(reading.usageUnits)} หน่วย`,
    quantity: reading.usageUnits,
    unitPrice: reading.rate,
    amount: reading.amount,
    meterReadingId: reading.id,
  };
  const tenant = getTenant(data, unit.tenantId);
  const totals = calculateInvoiceTotals({
    items: [item],
    vatEnabled: tenant?.vatEnabled ?? data.organization.vatEnabledDefault,
    vatRate: data.organization.vatRate,
  });

  return {
    id: createId("invoice"),
    tenantId: unit.tenantId,
    cycleId: reading.cycleId,
    invoiceNo: nextRunningNo("INV-256905", data.invoices.length),
    type: "electricity",
    issueDate: today(),
    dueDate: data.cycles.find((cycle) => cycle.id === reading.cycleId)?.dueDate ?? today(),
    items: [item],
    vatEnabled: tenant?.vatEnabled ?? data.organization.vatEnabledDefault,
    status: "issued",
    notes: reading.warning,
    ...totals,
  };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="rounded-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function ConfigStrip({ data }: { data: DashboardData }) {
  const items = [
    {
      label: "Neon",
      ok: data.databaseConfigured,
      text: data.databaseConfigured ? "เชื่อมฐานข้อมูลแล้ว" : "ใช้ข้อมูล demo",
    },
    {
      label: "Cloudinary",
      ok: data.cloudinaryConfigured,
      text: data.cloudinaryConfigured ? "พร้อมเก็บรูป" : "ยังไม่ตั้งค่า env",
    },
    {
      label: "Clerk",
      ok: data.clerkConfigured,
      text: data.clerkConfigured ? "เปิดล็อกอินแล้ว" : "โหมด dev ไม่บังคับล็อกอิน",
    },
    {
      label: "Stripe",
      ok: data.stripeConfigured,
      text: data.stripeConfigured ? "พร้อมรับเงินออนไลน์" : "ยังไม่ตั้งค่า env",
    },
    {
      label: "อีเมล",
      ok: true,
      text: data.resendConfigured ? "พร้อมส่งอีเมล" : "ใช้ส่งลิงก์เอง",
    },
  ];

  return (
    <section className="grid gap-2 md:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 border border-border bg-card px-3 py-2 text-sm"
        >
          {item.ok ? (
            <CheckCircle2 className="size-4 text-[var(--tone-ok)]" />
          ) : (
            <AlertCircle className="size-4 text-[var(--tone-warn)]" />
          )}
          <span className="font-medium">{item.label}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {item.text}
          </span>
        </div>
      ))}
    </section>
  );
}

function OverviewPanel({
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

function CyclePanel({
  data,
  activeCycle,
  selectedCycleId,
  onSelectCycle,
  onStatusChange,
  onBatchInvoices,
}: {
  data: DashboardData;
  activeCycle: BillingCycle | null;
  selectedCycleId: string;
  onSelectCycle: (cycleId: string) => void;
  onStatusChange: (cycleId: string, status: BillingCycle["status"]) => void;
  onBatchInvoices: () => void;
}) {
  const cycles = [...data.cycles].sort(
    (a, b) =>
      new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime(),
  );
  const activeSummary = activeCycle
    ? getCycleBillingSummary(data, activeCycle.id)
    : null;

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-md">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  {activeCycle?.label ?? "ยังไม่มีรอบบิล"}
                </CardTitle>
                <CardDescription>
                  {activeCycle
                    ? `${formatDate(activeCycle.periodStart)} - ${formatDate(activeCycle.periodEnd)}`
                    : "สร้างรอบบิลก่อนเริ่มออกเอกสาร"}
                </CardDescription>
              </div>
              {activeCycle ? (
                <Badge
                  className={cn(
                    "w-fit rounded-sm px-2 py-1",
                    cycleStatusClass[activeCycle.status],
                  )}
                >
                  {cycleStatusText[activeCycle.status]}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Info
              label="ใบแจ้งหนี้"
              value={`${activeSummary?.invoiceCount ?? 0} ใบ`}
            />
            <Info
              label="เลขมิเตอร์"
              value={`${activeSummary?.readingCount ?? 0} รายการ`}
            />
            <Info
              label="ยอดค้าง"
              value={formatCurrency(activeSummary?.outstanding ?? 0)}
            />
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="size-4" />
              สร้างบิลยกชุด
            </CardTitle>
            <CardDescription>
              {activeCycle?.status === "closed"
                ? "รอบบิลนี้ปิดแล้ว"
                : "รวมค่าเช่าและค่าไฟตามเลขที่บันทึก"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <BatchSummary data={data} cycleId={activeCycle?.id ?? ""} />
            <Button
              onClick={onBatchInvoices}
              disabled={!activeCycle || activeCycle.status === "closed"}
            >
              <Sparkles className="size-4" />
              สร้างใบแจ้งหนี้ยกชุด
            </Button>
          </CardContent>
        </Card>
      </div>

      {!cycles.length ? (
        <EmptyState label="ยังไม่มีรอบบิล" />
      ) : (
        <div className="overflow-hidden border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รอบบิล</TableHead>
                <TableHead>ช่วงวันที่</TableHead>
                <TableHead>ครบกำหนด</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">ใบแจ้งหนี้</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle) => {
                const summary = getCycleBillingSummary(data, cycle.id);
                const selected = cycle.id === selectedCycleId;

                return (
                  <TableRow key={cycle.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onSelectCycle(cycle.id)}
                        className={cn(
                          "text-left font-medium underline-offset-4 hover:underline",
                          selected && "text-primary",
                        )}
                      >
                        {cycle.label}
                      </button>
                    </TableCell>
                    <TableCell>
                      {formatDate(cycle.periodStart)} -{" "}
                      {formatDate(cycle.periodEnd)}
                    </TableCell>
                    <TableCell>{formatDate(cycle.dueDate)}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "rounded-sm px-2 py-1",
                          cycleStatusClass[cycle.status],
                        )}
                      >
                        {cycleStatusText[cycle.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {summary.invoiceCount}
                    </TableCell>
                    <TableCell>
                      {cycle.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onStatusChange(cycle.id, "closed")}
                        >
                          ปิดรอบ
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onStatusChange(cycle.id, "open")}
                        >
                          เปิดใช้
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function BatchSummary({
  data,
  cycleId,
}: {
  data: DashboardData;
  cycleId: string;
}) {
  const occupiedUnits = data.units.filter((unit) => unit.status === "occupied");
  const existingTenantIds = new Set(
    data.invoices
      .filter((invoice) => invoice.cycleId === cycleId)
      .map((invoice) => invoice.tenantId),
  );
  const latestReadingByUnit = new Map<string, MeterReading>();

  for (const reading of data.meterReadings.filter(
    (item) => item.cycleId === cycleId,
  )) {
    const existing = latestReadingByUnit.get(reading.unitId);
    if (
      !existing ||
      new Date(reading.capturedAt).getTime() >
        new Date(existing.capturedAt).getTime()
    ) {
      latestReadingByUnit.set(reading.unitId, reading);
    }
  }

  const readyUnits = occupiedUnits.filter(
    (unit) => unit.tenantId && !existingTenantIds.has(unit.tenantId),
  );
  const missingMeter = readyUnits.filter(
    (unit) => !latestReadingByUnit.has(unit.id),
  ).length;
  const missingMeterImage = readyUnits.filter((unit) => {
    const reading = latestReadingByUnit.get(unit.id);
    return reading && !hasMeterImage(reading);
  }).length;
  const readyWithMeterImage = readyUnits.filter((unit) => {
    const reading = latestReadingByUnit.get(unit.id);
    return reading && hasMeterImage(reading);
  }).length;

  return (
    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <Info label="พร้อมสร้าง" value={`${readyWithMeterImage} ห้อง`} />
      <Info label="มีบิลแล้ว" value={`${existingTenantIds.size} ห้อง`} />
      <Info label="ไม่มีเลขไฟ" value={`${missingMeter} ห้อง`} />
      <Info label="ไม่มีรูป" value={`${missingMeterImage} ห้อง`} />
    </div>
  );
}

function getCycleBillingSummary(data: DashboardData, cycleId: string) {
  const invoices = data.invoices.filter((invoice) => invoice.cycleId === cycleId);
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const payments = data.payments.filter((payment) =>
    invoiceIds.has(payment.invoiceId),
  );
  const readings = data.meterReadings.filter(
    (reading) => reading.cycleId === cycleId,
  );

  return {
    invoiceCount: invoices.length,
    readingCount: readings.length,
    paymentCount: payments.length,
    outstanding: invoices.reduce((sum, invoice) => sum + invoice.balance, 0),
  };
}

function TenantList({
  data,
  tenants,
  onCreatePortalLink,
  onRevokePortalLink,
  onUpdateTenant,
}: {
  data: DashboardData;
  tenants: Tenant[];
  onCreatePortalLink?: (tenantId: string) => void;
  onRevokePortalLink?: (linkId: string) => void;
  onUpdateTenant?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!tenants.length) return <EmptyState label="ยังไม่มีผู้เช่า" />;

  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-2">
      {tenants.map((tenant) => {
        const unit = data.units.find((item) => item.tenantId === tenant.id);
        const portalLinks = data.portalLinks.filter(
          (link) => link.tenantId === tenant.id && link.active,
        );

        return (
          <Card key={tenant.id} className="rounded-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {tenant.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {tenant.code} · {tenant.contactName || "ไม่มีชื่อผู้ติดต่อ"}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-sm">
                  {tenant.vatEnabled ? "VAT" : "ไม่มี VAT"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="พื้นที่" value={unit?.code ?? "-"} />
                <Info
                  label="ค่าเช่า"
                  value={unit ? formatCurrency(unit.rentAmount) : "-"}
                />
                <Info label="โทร" value={tenant.phone || "-"} />
                <Info label="อีเมล" value={tenant.email || "-"} />
              </div>
              <Separator />
              <p className="line-clamp-2 text-muted-foreground">
                {tenant.billingAddress || "ยังไม่มีที่อยู่สำหรับออกบิล"}
              </p>
              <div className="flex flex-wrap gap-2">
                {onUpdateTenant ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        แก้ไข
                      </Button>
                    </DialogTrigger>
                    <TenantDialog
                      tenant={tenant}
                      onSubmit={onUpdateTenant}
                      title="แก้ไขผู้เช่า"
                    />
                  </Dialog>
                ) : null}
                {onCreatePortalLink ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreatePortalLink(tenant.id)}
                  >
                    <Link2 className="size-4" />
                    สร้างลิงก์
                  </Button>
                ) : null}
                {portalLinks.map((link) => (
                  <Button
                    key={link.id}
                    size="sm"
                    variant="outline"
                    onClick={() => onRevokePortalLink?.(link.id)}
                  >
                    ปิดลิงก์
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function MeterList({
  data,
  cycleId,
  compact,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
}) {
  const sourceReadings = cycleId
    ? data.meterReadings.filter((reading) => reading.cycleId === cycleId)
    : data.meterReadings;
  const readings = compact ? sourceReadings.slice(0, 3) : sourceReadings;

  if (!readings.length) return <EmptyState label="ยังไม่มีเลขมิเตอร์" />;

  return (
    <section className="grid gap-3">
      {!compact && (
        <h2 className="text-lg font-semibold tracking-tight">
          รูปถ่ายและเลขมิเตอร์
        </h2>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {readings.map((reading) => {
          const unit = getUnit(data, reading.unitId);
          const tenant = getTenant(data, reading.tenantId);
          const imageSrc = meterReadingImageSrc(reading);

          return (
            <Card key={reading.id} className="overflow-hidden rounded-md">
              <div className="aspect-[16/10] bg-muted">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={`รูปมิเตอร์ ${unit?.code ?? ""}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Upload className="size-7" />
                    <span>ยังไม่มีรูปมิเตอร์</span>
                  </div>
                )}
              </div>
              <CardContent className="grid gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {unit?.code ?? "-"} · {tenant?.name ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(reading.capturedAt)}
                    </p>
                  </div>
                  {reading.warning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="rounded-sm bg-[var(--tone-danger-soft)] text-[var(--tone-danger)]">
                          ตรวจสอบ
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{reading.warning}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge className="rounded-sm bg-[var(--tone-ok-soft)] text-[var(--tone-ok)]">
                      ปกติ
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Info label="ก่อน" value={formatNumber(reading.previousReading)} />
                  <Info label="หลัง" value={formatNumber(reading.currentReading)} />
                  <Info label="ใช้" value={`${formatNumber(reading.usageUnits)} หน่วย`} />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(reading.rate)} / หน่วย
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(reading.amount)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function InvoiceList({
  data,
  cycleId,
  compact,
  onUpdateInvoice,
  onSendInvoice,
  onSendReminder,
  onVoidInvoice,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
  onUpdateInvoice?: (formData: FormData) => Promise<boolean>;
  onSendInvoice?: (invoiceId: string) => void;
  onSendReminder?: (invoiceId: string) => void;
  onVoidInvoice?: (invoiceId: string) => void;
}) {
  const sourceInvoices = cycleId
    ? data.invoices.filter((invoice) => invoice.cycleId === cycleId)
    : data.invoices;
  const invoices = compact ? sourceInvoices.slice(0, 5) : sourceInvoices;

  if (!invoices.length) return <EmptyState label="ยังไม่มีใบแจ้งหนี้" />;

  if (compact) {
    return (
      <section className="grid gap-3">
        {invoices.map((invoice) => {
          const tenant = getTenant(data, invoice.tenantId);

          return (
            <Card key={invoice.id} className="rounded-md">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">
                      {invoice.invoiceNo}
                    </span>
                    {invoiceTypeBadge(invoice.type)}
                    {invoiceStatusBadge(invoice.status)}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {tenant?.name ?? "-"} · ครบกำหนด {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <div className="grid gap-1 text-sm sm:min-w-44 sm:text-right">
                  <span className="font-semibold">
                    {formatCurrency(invoice.total)}
                  </span>
                  <span className="text-muted-foreground">
                    ค้าง {formatCurrency(invoice.balance)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {!compact && (
        <h2 className="text-lg font-semibold tracking-tight">ใบแจ้งหนี้</h2>
      )}
      <div className="hidden overflow-hidden border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่</TableHead>
              <TableHead>ผู้เช่า</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>กำหนดชำระ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">ยอดรวม</TableHead>
              <TableHead className="text-right">ค้างชำระ</TableHead>
              <TableHead className="w-44"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const tenant = getTenant(data, invoice.tenantId);

              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">
                    {invoice.invoiceNo}
                  </TableCell>
                  <TableCell>{tenant?.name ?? "-"}</TableCell>
                  <TableCell>{invoiceTypeBadge(invoice.type)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>{invoiceStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(invoice.balance)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {onUpdateInvoice && invoice.status !== "void" ? (
                        <InvoiceEditButton
                          data={data}
                          invoice={invoice}
                          onUpdateInvoice={onUpdateInvoice}
                        />
                      ) : null}
                      <PrintButton href={`/print/invoice/${invoice.id}`} />
                      {onSendInvoice ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onSendInvoice(invoice.id)}
                          title="ส่งอีเมล"
                        >
                          <Mail className="size-4" />
                        </Button>
                      ) : null}
                      {onSendReminder &&
                      invoice.balance > 0 &&
                      invoice.status !== "void" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onSendReminder(invoice.id)}
                          title="ส่งเตือนชำระ"
                        >
                          <AlertCircle className="size-4" />
                        </Button>
                      ) : null}
                      {onVoidInvoice && invoice.status !== "void" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onVoidInvoice(invoice.id)}
                          title="ยกเลิก"
                        >
                          <AlertCircle className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {invoices.map((invoice) => {
          const tenant = getTenant(data, invoice.tenantId);

          return (
            <Card key={invoice.id} className="rounded-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {invoice.invoiceNo}
                    </CardTitle>
                    <CardDescription>{tenant?.name ?? "-"}</CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {invoiceTypeBadge(invoice.type)}
                    {invoiceStatusBadge(invoice.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="ยอดรวม" value={formatCurrency(invoice.total)} />
                  <Info label="ค้างชำระ" value={formatCurrency(invoice.balance)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/print/invoice/${invoice.id}`}>
                      <Printer className="size-4" />
                      พิมพ์
                    </a>
                  </Button>
                  {onUpdateInvoice && invoice.status !== "void" ? (
                    <InvoiceEditButton
                      data={data}
                      invoice={invoice}
                      onUpdateInvoice={onUpdateInvoice}
                      buttonVariant="outline"
                    />
                  ) : null}
                  {onSendInvoice ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSendInvoice(invoice.id)}
                    >
                      <Mail className="size-4" />
                      ส่งอีเมล
                    </Button>
                  ) : null}
                  {onSendReminder &&
                  invoice.balance > 0 &&
                  invoice.status !== "void" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSendReminder(invoice.id)}
                    >
                      ส่งเตือน
                    </Button>
                  ) : null}
                  {onVoidInvoice && invoice.status !== "void" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVoidInvoice(invoice.id)}
                    >
                      ยกเลิก
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function InvoiceEditButton({
  data,
  invoice,
  onUpdateInvoice,
  buttonVariant = "ghost",
}: {
  data: DashboardData;
  invoice: Invoice;
  onUpdateInvoice: (formData: FormData) => Promise<boolean>;
  buttonVariant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const isOutline = buttonVariant === "outline";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size={isOutline ? "sm" : "icon"}
        variant={buttonVariant}
        title="แก้ไขใบแจ้งหนี้"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
        {isOutline ? "แก้ไข" : <span className="sr-only">แก้ไข</span>}
      </Button>
      <InvoiceEditDialog
        data={data}
        invoice={invoice}
        onSaved={() => setOpen(false)}
        onUpdateInvoice={onUpdateInvoice}
      />
    </Dialog>
  );
}

function InvoiceEditDialog({
  data,
  invoice,
  onSaved,
  onUpdateInvoice,
}: {
  data: DashboardData;
  invoice: Invoice;
  onSaved: () => void;
  onUpdateInvoice: (formData: FormData) => Promise<boolean>;
}) {
  const [tenantId, setTenantId] = useState(invoice.tenantId);
  const [vatEnabled, setVatEnabled] = useState(invoice.vatEnabled ? "yes" : "no");
  const [rows, setRows] = useState<InvoiceEditFormRow[]>(() =>
    invoice.items.length
      ? invoice.items.map((item) => createInvoiceEditRow(item))
      : [createInvoiceEditRow()],
  );
  const normalizedRows = useMemo(() => normalizeInvoiceEditRows(rows), [rows]);
  const itemsJson = JSON.stringify(normalizedRows);
  const subtotal = normalizedRows.reduce(
    (sum, row) => sum + row.quantity * row.unitPrice,
    0,
  );

  function updateRow(
    rowId: string,
    key: keyof Omit<InvoiceEditFormRow, "id" | "itemId" | "meterReadingId">,
    value: string,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [key]: value } : row,
      ),
    );
  }

  function addRow() {
    setRows((current) => [...current, createInvoiceEditRow()]);
  }

  function removeRow(rowId: string) {
    setRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== rowId) : current,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await onUpdateInvoice(new FormData(event.currentTarget));
    if (ok) onSaved();
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>แก้ไขใบแจ้งหนี้ {invoice.invoiceNo}</DialogTitle>
        <DialogDescription>แก้ผู้ถูกเรียกเก็บ รายการ ยอด และวันครบกำหนด</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <input type="hidden" name="itemsJson" value={itemsJson} />
        <div className="grid gap-3">
          <div className="grid min-w-0 gap-2">
            <Label>ผู้ถูกเรียกเก็บ</Label>
            <Select name="tenantId" value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                <SelectValue placeholder="เลือกผู้ถูกเรียกเก็บ" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)]">
                {data.tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    <span className="block max-w-[32rem] truncate">
                      {tenant.code} · {tenant.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="กำหนดชำระ"
              name="dueDate"
              type="date"
              defaultValue={dateInputValue(invoice.dueDate)}
            />
            <Field
              label="ส่วนลด"
              name="discount"
              type="number"
              step="0.01"
              defaultValue={String(invoice.discount)}
            />
            <div className="grid gap-2">
              <Label>VAT</Label>
              <Select
                name="vatEnabled"
                value={vatEnabled}
                onValueChange={setVatEnabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">คิด VAT</SelectItem>
                  <SelectItem value="no">ไม่คิด VAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>รายการในใบแจ้งหนี้</Label>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              เพิ่มรายการ
            </Button>
          </div>
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[9rem_minmax(0,1fr)_6rem_9rem_2.5rem]"
              >
                <div className="grid gap-2">
                  <Label>ประเภท</Label>
                  <Select
                    value={row.type}
                    onValueChange={(value) =>
                      updateRow(row.id, "type", value as InvoiceType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {editableInvoiceTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {formatInvoiceType(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor={`editInvoiceDescription-${row.id}`}>
                    รายละเอียด
                  </Label>
                  <Input
                    id={`editInvoiceDescription-${row.id}`}
                    value={row.description}
                    placeholder={`รายการ ${index + 1}`}
                    onChange={(event) =>
                      updateRow(row.id, "description", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`editInvoiceQuantity-${row.id}`}>จำนวน</Label>
                  <Input
                    id={`editInvoiceQuantity-${row.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(event) =>
                      updateRow(row.id, "quantity", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`editInvoicePrice-${row.id}`}>ราคา/หน่วย</Label>
                  <Input
                    id={`editInvoicePrice-${row.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitPrice}
                    onChange={(event) =>
                      updateRow(row.id, "unitPrice", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 size-9"
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">ลบรายการ</span>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">รวมก่อน VAT</span>
            <span className="font-semibold">{formatCurrency(subtotal)}</span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`editInvoiceNotes-${invoice.id}`}>หมายเหตุ</Label>
          <Textarea
            id={`editInvoiceNotes-${invoice.id}`}
            name="notes"
            defaultValue={invoice.notes ?? ""}
            rows={3}
          />
        </div>
        <Button type="submit">บันทึกการแก้ไข</Button>
      </form>
    </DialogContent>
  );
}

function PaymentList({
  data,
  cycleId,
  compact,
  onSendReceipt,
  onVoidPayment,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
  onSendReceipt?: (paymentId: string) => void;
  onVoidPayment?: (paymentId: string) => void;
}) {
  const cycleInvoiceIds = new Set(
    data.invoices
      .filter((invoice) => !cycleId || invoice.cycleId === cycleId)
      .map((invoice) => invoice.id),
  );
  const sourcePayments = data.payments.filter((payment) =>
    cycleInvoiceIds.has(payment.invoiceId),
  );
  const payments = compact ? sourcePayments.slice(0, 4) : sourcePayments;

  if (!payments.length) return <EmptyState label="ยังไม่มีรายการชำระเงิน" />;

  return (
    <section className="grid gap-3">
      {!compact && (
        <h2 className="text-lg font-semibold tracking-tight">ชำระเงิน</h2>
      )}
      <div className="grid gap-3">
        {payments.map((payment) => {
          const invoice = data.invoices.find((item) => item.id === payment.invoiceId);
          const tenant = invoice ? getTenant(data, invoice.tenantId) : undefined;

          return (
            <Card key={payment.id} className="rounded-md">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs">{payment.receiptNo}</p>
                    <Badge variant="outline" className="rounded-sm">
                      {methodText[payment.method]}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {tenant?.name ?? "-"} · {invoice?.invoiceNo ?? "-"} ·{" "}
                    {formatDate(payment.paidAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="font-semibold">
                    {formatCurrency(payment.amount)}
                  </span>
                  {onSendReceipt ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onSendReceipt(payment.id)}
                      title="ส่งใบเสร็จ"
                    >
                      <Mail className="size-4" />
                    </Button>
                  ) : null}
                  <PrintButton href={`/print/receipt/${payment.id}`} />
                  {onVoidPayment && payment.refundStatus === "none" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onVoidPayment(payment.id)}
                    >
                      ยกเลิก
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function ReportsPanel({
  data,
  cycleId,
}: {
  data: DashboardData;
  cycleId: string;
}) {
  const cycleInvoices = cycleId
    ? data.invoices.filter((invoice) => invoice.cycleId === cycleId)
    : data.invoices;
  const outstanding = cycleInvoices.reduce(
    (sum, invoice) => sum + invoice.balance,
    0,
  );
  const total = cycleInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const vat = cycleInvoices.reduce((sum, invoice) => sum + invoice.vatAmount, 0);
  const monthlyRows = data.cycles.map((cycle) => {
    const invoices = data.invoices.filter((invoice) => invoice.cycleId === cycle.id);
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
    const paid = data.payments
      .filter((payment) => invoiceIds.has(payment.invoiceId))
      .reduce((sum, payment) => sum + payment.amount, 0);

    return {
      cycle,
      invoices: invoices.length,
      total: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
      paid,
      outstanding: invoices.reduce((sum, invoice) => sum + invoice.balance, 0),
      vat: invoices.reduce((sum, invoice) => sum + invoice.vatAmount, 0),
    };
  });
  const reports = [
    ["outstanding", "ยอดค้าง"],
    ["payments", "ยอดรับเงิน"],
    ["vat", "VAT"],
    ["cycles", "รอบบิล"],
    ["meters", "มิเตอร์"],
    ["monthly", "รายเดือน"],
  ];

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-md">
          <CardContent className="p-4">
            <Info label="ยอดบิล" value={formatCurrency(total)} />
          </CardContent>
        </Card>
        <Card className="rounded-md">
          <CardContent className="p-4">
            <Info label="ยอดค้าง" value={formatCurrency(outstanding)} />
          </CardContent>
        </Card>
        <Card className="rounded-md">
          <CardContent className="p-4">
            <Info label="VAT" value={formatCurrency(vat)} />
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">Export CSV</CardTitle>
          <CardDescription>ดาวน์โหลดข้อมูลสำหรับบัญชีและตรวจสอบยอด</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {reports.map(([type, label]) => (
            <Button key={type} asChild variant="outline">
              <a href={`/api/reports/${type}`}>{label}</a>
            </Button>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">รายงานรายเดือน</CardTitle>
          <CardDescription>สรุปยอดบิล รับเงิน ค้างชำระ และ VAT ตามรอบบิล</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-hidden border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รอบบิล</TableHead>
                  <TableHead className="text-right">บิล</TableHead>
                  <TableHead className="text-right">ยอดรวม</TableHead>
                  <TableHead className="text-right">รับเงิน</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.map((row) => (
                  <TableRow key={row.cycle.id}>
                    <TableCell>{row.cycle.label}</TableCell>
                    <TableCell className="text-right">{row.invoices}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.paid)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.outstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.vat)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {monthlyRows.map((row) => (
              <div
                key={row.cycle.id}
                className="grid gap-2 border border-border p-4 text-sm"
              >
                <p className="font-medium">{row.cycle.label}</p>
                <Info label="ยอดรวม" value={formatCurrency(row.total)} />
                <Info label="รับเงิน" value={formatCurrency(row.paid)} />
                <Info label="ค้าง" value={formatCurrency(row.outstanding)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SettingsPanel({
  data,
  onOrganizationSubmit,
  onRoleSubmit,
  onUnitSubmit,
}: {
  data: DashboardData;
  onOrganizationSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRoleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUnitSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลผู้ออกเอกสาร</CardTitle>
          <CardDescription>ใช้ในใบแจ้งหนี้และใบเสร็จ</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onOrganizationSubmit} className="grid gap-3">
            <Field label="ชื่อบริษัท" name="name" defaultValue={data.organization.name} />
            <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" defaultValue={data.organization.taxId} />
            <Field label="โทร" name="phone" defaultValue={data.organization.phone} />
            <Field label="อีเมล" name="email" type="email" defaultValue={data.organization.email} />
            <Field label="VAT เริ่มต้น" name="vatRate" type="number" step="0.01" defaultValue={String(data.organization.vatRate)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="ชื่อบัญชี"
                name="bankAccountName"
                defaultValue={data.organization.bankAccountName}
              />
              <Field
                label="เลขที่บัญชี"
                name="bankAccountNumber"
                defaultValue={data.organization.bankAccountNumber}
              />
              <Field
                label="ธนาคาร"
                name="bankName"
                defaultValue={data.organization.bankName}
              />
              <Field
                label="สาขา"
                name="bankBranch"
                defaultValue={data.organization.bankBranch}
              />
            </div>
            <Field
              label="Line ID สำหรับแจ้งโอน"
              name="paymentLineId"
              defaultValue={data.organization.paymentLineId}
            />
            <div className="grid gap-2">
              <Label htmlFor="orgAddress">ที่อยู่</Label>
              <Textarea
                id="orgAddress"
                name="address"
                defaultValue={data.organization.address}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>คิด VAT เริ่มต้น</Label>
              <Select
                name="vatEnabledDefault"
                defaultValue={data.organization.vatEnabledDefault ? "yes" : "no"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">คิด VAT</SelectItem>
                  <SelectItem value="no">ไม่คิด VAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">บันทึกข้อมูลบริษัท</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">ผู้ใช้ระบบ</CardTitle>
          <CardDescription>สิทธิ์แอดมินและพนักงาน</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.users.map((user) => (
            <form
              key={user.id}
              onSubmit={onRoleSubmit}
              className="grid gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-center"
            >
              <input type="hidden" name="userId" value={user.id} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <Select name="role" defaultValue={user.role}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">แอดมิน</SelectItem>
                  <SelectItem value="staff">พนักงาน</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" variant="outline">
                บันทึก
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-md lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">พื้นที่เช่า</CardTitle>
          <CardDescription>แก้ค่าเช่า เรทไฟ และสถานะพื้นที่</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.units.map((unit) => (
            <Card key={unit.id} className="rounded-md">
              <CardContent className="grid gap-3 p-4">
                <div>
                  <p className="font-medium">{unit.code}</p>
                  <p className="text-sm text-muted-foreground">{unit.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="ค่าเช่า" value={formatCurrency(unit.rentAmount)} />
                  <Info label="ค่าไฟ" value={formatCurrency(unit.electricRate)} />
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      แก้ไขพื้นที่
                    </Button>
                  </DialogTrigger>
                  <UnitDialog data={data} unit={unit} onSubmit={onUnitSubmit} />
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function CycleDialog({
  data,
  activeCycle,
  onSubmit,
}: {
  data: DashboardData;
  activeCycle: BillingCycle | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const latestCycle = [...data.cycles].sort(
    (a, b) =>
      new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime(),
  )[0];
  const baseDate = latestCycle
    ? addMonths(new Date(latestCycle.periodStart), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = endOfMonth(baseDate);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>สร้างรอบบิลใหม่</DialogTitle>
        <DialogDescription>กำหนดช่วงวันที่และวันครบกำหนด</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input
          type="hidden"
          name="closeCurrentCycleId"
          value={activeCycle?.status === "open" ? activeCycle.id : ""}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="ชื่อรอบบิล"
            name="label"
            defaultValue={cycleLabel(baseDate)}
            required
          />
          <div className="grid gap-2">
            <Label>สถานะ</Label>
            <Select name="status" defaultValue="open">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">เปิดใช้งาน</SelectItem>
                <SelectItem value="draft">ร่าง</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field
            label="เริ่มรอบ"
            name="periodStart"
            type="date"
            defaultValue={dateInputValue(baseDate)}
            required
          />
          <Field
            label="สิ้นสุดรอบ"
            name="periodEnd"
            type="date"
            defaultValue={dateInputValue(periodEnd)}
            required
          />
          <Field
            label="ครบกำหนดชำระ"
            name="dueDate"
            type="date"
            defaultValue={dateInputValue(periodEnd)}
            required
          />
        </div>
        <Button type="submit">สร้างรอบบิล</Button>
      </form>
    </DialogContent>
  );
}

function TenantDialog({
  onSubmit,
  tenant,
  title = "เพิ่มผู้เช่า",
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  tenant?: Tenant;
  title?: string;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>ข้อมูลนี้ใช้ผูกพื้นที่และออกเอกสาร</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="tenantId" value={tenant?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="รหัสผู้เช่า"
            name="code"
            placeholder="T-003"
            defaultValue={tenant?.code}
          />
          <Field
            label="ชื่อผู้เช่า"
            name="name"
            defaultValue={tenant?.name}
            required
          />
          <Field
            label="ผู้ติดต่อ"
            name="contactName"
            defaultValue={tenant?.contactName}
          />
          <Field label="โทร" name="phone" defaultValue={tenant?.phone} />
          <Field
            label="อีเมล"
            name="email"
            type="email"
            defaultValue={tenant?.email}
          />
          <Field label="เลขภาษี" name="taxId" defaultValue={tenant?.taxId} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="billingAddress">ที่อยู่สำหรับออกบิล</Label>
          <Textarea
            id="billingAddress"
            name="billingAddress"
            rows={3}
            defaultValue={tenant?.billingAddress}
          />
        </div>
        <div className="grid gap-2">
          <Label>VAT</Label>
          <Select name="vatEnabled" defaultValue={tenant?.vatEnabled === false ? "no" : "yes"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">คิด VAT</SelectItem>
              <SelectItem value="no">ไม่คิด VAT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">บันทึกผู้เช่า</Button>
      </form>
    </DialogContent>
  );
}

function UnitDialog({
  data,
  unit,
  onSubmit,
}: {
  data: DashboardData;
  unit: RentalUnit;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>แก้ไขพื้นที่เช่า</DialogTitle>
        <DialogDescription>ค่าเช่า เรทไฟ และผู้เช่าปัจจุบัน</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="unitId" value={unit.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="รหัสพื้นที่" name="code" defaultValue={unit.code} />
          <Field label="ชื่อพื้นที่" name="name" defaultValue={unit.name} />
          <Field
            label="ค่าเช่า"
            name="rentAmount"
            type="number"
            step="0.01"
            defaultValue={String(unit.rentAmount)}
          />
          <Field
            label="ค่าไฟต่อหน่วย"
            name="electricRate"
            type="number"
            step="0.01"
            defaultValue={String(unit.electricRate)}
          />
          <Field
            label="เลขมิเตอร์"
            name="meterSerial"
            defaultValue={unit.meterSerial}
          />
          <div className="grid gap-2">
            <Label>สถานะ</Label>
            <Select name="status" defaultValue={unit.status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="occupied">มีผู้เช่า</SelectItem>
                <SelectItem value="vacant">ว่าง</SelectItem>
                <SelectItem value="maintenance">ซ่อมบำรุง</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>ผู้เช่า</Label>
          <Select name="tenantId" defaultValue={unit.tenantId || data.tenants[0]?.id}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกผู้เช่า" />
            </SelectTrigger>
            <SelectContent>
              {data.tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.code} · {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">บันทึกพื้นที่เช่า</Button>
      </form>
    </DialogContent>
  );
}

function meterReadingImageSrc(reading?: MeterReading) {
  if (!reading || !hasMeterImage(reading)) return "";

  return reading.cloudinaryPublicId?.startsWith("demo/")
    ? reading.imageUrl
    : `/api/meter-images/${reading.id}`;
}

function MeterDialog({
  data,
  activeCycleId,
  isUploading,
  uploadMessage,
  uploadResult,
  onFileChange,
  onSubmit,
}: {
  data: DashboardData;
  activeCycleId: string;
  isUploading: boolean;
  uploadMessage: string;
  uploadResult: UploadResult | null;
  onFileChange: (file?: File) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? "");
  const unit = getUnit(data, unitId);
  const lastReading = [...data.meterReadings]
    .filter(
      (reading) =>
        reading.unitId === unitId && reading.cycleId !== activeCycleId,
    )
    .sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    )[0];
  const previousImageReading = [...data.meterReadings]
    .filter(
      (reading) =>
        reading.unitId === unitId &&
        reading.cycleId !== activeCycleId &&
        hasMeterImage(reading),
    )
    .sort((a, b) => {
      const actualReadingScore =
        Number(b.usageUnits > 0) - Number(a.usageUnits > 0);

      return (
        actualReadingScore ||
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
      );
    })[0];
  const previousImageSrc = meterReadingImageSrc(previousImageReading);
  const previousDisplayReading = previousImageReading ?? lastReading;

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>บันทึกมิเตอร์ไฟ</DialogTitle>
        <DialogDescription>
          อัปโหลดรูปเดือนนี้ ระบบจะดึงรูปเดือนก่อนจากเลขล่าสุดของพื้นที่เดียวกัน
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="cycleId" value={activeCycleId} />
        <input type="hidden" name="billingCycleId" value={activeCycleId} />
        <input type="hidden" name="tenantId" value={unit?.tenantId ?? ""} />
        <input
          type="hidden"
          name="cloudinaryPublicId"
          value={uploadResult?.publicId ?? ""}
        />
        <input
          type="hidden"
          name="cloudinaryAssetId"
          value={uploadResult?.assetId ?? ""}
        />
        <input
          type="hidden"
          name="cloudinarySecureUrl"
          value={uploadResult?.url ?? ""}
        />
        <input
          type="hidden"
          name="cloudinaryVersion"
          value={uploadResult?.version ?? ""}
        />
        <input
          type="hidden"
          name="imageWidth"
          value={uploadResult?.width ?? ""}
        />
        <input
          type="hidden"
          name="imageHeight"
          value={uploadResult?.height ?? ""}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>พื้นที่</Label>
            <Select name="unitId" value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกพื้นที่" />
              </SelectTrigger>
              <SelectContent>
                {data.units.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} · {getTenant(data, item.tenantId)?.name ?? "-"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            key={`${unit?.id ?? "unit"}-rate`}
            label="เรทต่อหน่วย"
            name="rate"
            type="number"
            step="0.01"
            defaultValue={String(unit?.electricRate ?? 0)}
          />
          <Field
            key={`${unit?.id ?? "unit"}-previous`}
            label="เลขเดือนก่อน"
            name="previousReading"
            type="number"
            defaultValue={String(lastReading?.currentReading ?? 0)}
          />
          <Field label="เลขเดือนนี้" name="currentReading" type="number" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meterImage">รูปมิเตอร์ประกอบใบแจ้งหนี้</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">เดือนก่อน</span>
                <span className="text-xs text-muted-foreground">
                  {previousDisplayReading
                    ? formatDate(previousDisplayReading.capturedAt)
                    : "ยังไม่มีข้อมูล"}
                </span>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted">
                {previousImageSrc ? (
                  <img
                    src={previousImageSrc}
                    alt="รูปมิเตอร์เดือนก่อน"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid place-items-center gap-2 px-3 text-center text-xs text-muted-foreground">
                    <Upload className="size-7" />
                    <span>ยังไม่มีรูปเดือนก่อน</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                เลขล่าสุด{" "}
                {previousDisplayReading
                  ? formatNumber(previousDisplayReading.currentReading)
                  : "-"}
              </p>
            </div>

            <div className="rounded-md border border-dashed border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">เดือนปัจจุบัน</span>
                <span className="text-xs text-muted-foreground">
                  ต้องอัปโหลดก่อนบันทึก
                </span>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted">
                {uploadResult ? (
                  <img
                    src={uploadResult.url}
                    alt="ตัวอย่างรูปมิเตอร์เดือนปัจจุบัน"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="mt-3 grid gap-2">
                <Input
                  id="meterImage"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => onFileChange(event.target.files?.[0])}
                />
                <p className="text-xs text-muted-foreground">
                  {isUploading
                    ? "กำลังอัปโหลด..."
                    : uploadMessage || "รองรับ JPG, PNG, HEIC"}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            เวลาออกใบแจ้งหนี้ ระบบจะแสดงรูปเดือนก่อนและรูปเดือนปัจจุบันคู่กัน
          </p>
        </div>
        <div className="grid gap-2">
          <Label>ออกใบแจ้งหนี้ค่าไฟ</Label>
          <Select name="createInvoice" defaultValue="yes">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">ออกใบแจ้งหนี้ทันที</SelectItem>
              <SelectItem value="no">บันทึกเลขอย่างเดียว</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isUploading}>
          บันทึกมิเตอร์
        </Button>
      </form>
    </DialogContent>
  );
}

function RentInvoiceDialog({
  data,
  activeCycle,
  onSubmit,
}: {
  data: DashboardData;
  activeCycle: DashboardData["cycles"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? "");
  const unit = getUnit(data, unitId);
  const tenant = unit ? getTenant(data, unit.tenantId) : undefined;

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>ออกใบแจ้งหนี้ค่าเช่า</DialogTitle>
        <DialogDescription>สร้างเอกสารจากพื้นที่และรอบบิลปัจจุบัน</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="billingCycleId" value={activeCycle.id} />
        <input type="hidden" name="tenantId" value={unit?.tenantId ?? ""} />
        <input type="hidden" name="type" value="rent" />
        <input type="hidden" name="quantity" value="1" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>พื้นที่</Label>
            <Select name="unitId" value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.units.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.code} · {getTenant(data, item.tenantId)?.name ?? "-"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            key={`${unit?.id ?? "unit"}-rent`}
            label="ค่าเช่า"
            name="rentAmount"
            type="number"
            defaultValue={String(unit?.rentAmount ?? 0)}
          />
          <Field label="ส่วนลด" name="discount" type="number" defaultValue="0" />
          <Field
            label="กำหนดชำระ"
            name="dueDate"
            type="date"
            defaultValue={activeCycle.dueDate.slice(0, 10)}
          />
        </div>
        <Field
          label="รายละเอียด"
          name="description"
          defaultValue={unit ? `ค่าเช่าพื้นที่ ${unit.code} รอบ ${activeCycle.label}` : ""}
        />
        <div className="grid gap-2">
          <Label>VAT</Label>
          <Select
            key={`${unitId}-rent-vat`}
            name="vatEnabled"
            defaultValue={tenant?.vatEnabled ?? true ? "yes" : "no"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">คิด VAT</SelectItem>
              <SelectItem value="no">ไม่คิด VAT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">ออกใบแจ้งหนี้</Button>
      </form>
    </DialogContent>
  );
}

function FuelTransportInvoiceDialog({
  data,
  activeCycle,
  onSubmit,
}: {
  data: DashboardData;
  activeCycle: DashboardData["cycles"][number];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [tenantId, setTenantId] = useState(data.tenants[0]?.id ?? "");
  const defaultTripDate = activeCycle.periodStart.slice(0, 10);
  const [tripRows, setTripRows] = useState<FuelTripFormRow[]>(() => [
    createFuelTripRow(defaultTripDate, 0),
  ]);
  const tenant = getTenant(data, tenantId);
  const normalizedTrips = useMemo(
    () => normalizeFuelTripRows(tripRows),
    [tripRows],
  );
  const tripSubtotal = normalizedTrips.reduce(
    (sum, row) => sum + row.quantity * row.unitPrice,
    0,
  );
  const itemsJson = JSON.stringify(normalizedTrips);

  const updateTripRow = (
    rowId: string,
    key: keyof Omit<FuelTripFormRow, "id">,
    value: string,
  ) => {
    setTripRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [key]: value } : row,
      ),
    );
  };

  const addTripRow = () => {
    setTripRows((current) => [
      ...current,
      createFuelTripRow(defaultTripDate, current.length),
    ]);
  };

  const removeTripRow = (rowId: string) => {
    setTripRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== rowId) : current,
    );
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>ออกใบแจ้งหนี้ค่าขนส่งน้ำมัน</DialogTitle>
        <DialogDescription>เลือกผู้ถูกเรียกเก็บและกรอกรอบวิ่ง</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="billingCycleId" value={activeCycle.id} />
        <input type="hidden" name="type" value="fuel_transport" />
        <input type="hidden" name="itemsJson" value={itemsJson} />
        <div className="grid gap-3">
          <div className="grid min-w-0 gap-2">
            <Label>ผู้ถูกเรียกเก็บ</Label>
            <Select name="tenantId" value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                <SelectValue placeholder="เลือกผู้ถูกเรียกเก็บ" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)]">
                {data.tenants.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="block max-w-[32rem] truncate">
                      {item.code} · {item.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-w-xs">
            <Field
              label="กำหนดชำระ"
              name="dueDate"
              type="date"
              defaultValue={activeCycle.dueDate.slice(0, 10)}
            />
          </div>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>รายการรอบวิ่ง</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTripRow}
            >
              <Plus className="size-4" />
              เพิ่มรอบวิ่ง
            </Button>
          </div>
          <div className="grid gap-3">
            {tripRows.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[10rem_minmax(0,1fr)_7rem_10rem_2.5rem]"
              >
                <div className="grid gap-2">
                  <Label htmlFor={`fuelTripDate-${row.id}`}>วันที่วิ่ง</Label>
                  <Input
                    id={`fuelTripDate-${row.id}`}
                    type="date"
                    value={row.date}
                    onChange={(event) =>
                      updateTripRow(row.id, "date", event.target.value)
                    }
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor={`fuelTripLabel-${row.id}`}>รอบวิ่ง</Label>
                  <Input
                    id={`fuelTripLabel-${row.id}`}
                    value={row.label}
                    placeholder={`รอบวิ่ง ${index + 1}`}
                    onChange={(event) =>
                      updateTripRow(row.id, "label", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`fuelTripQuantity-${row.id}`}>จำนวนเที่ยว</Label>
                  <Input
                    id={`fuelTripQuantity-${row.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(event) =>
                      updateTripRow(row.id, "quantity", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`fuelTripPrice-${row.id}`}>ค่าเที่ยว</Label>
                  <Input
                    id={`fuelTripPrice-${row.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitPrice}
                    onChange={(event) =>
                      updateTripRow(row.id, "unitPrice", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 size-9"
                  disabled={tripRows.length === 1}
                  onClick={() => removeTripRow(row.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">ลบรอบวิ่ง</span>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">รวมก่อน VAT</span>
            <span className="font-semibold">{formatCurrency(tripSubtotal)}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="ส่วนลด"
            name="discount"
            type="number"
            step="0.01"
            defaultValue="0"
          />
          <div className="grid gap-2">
            <Label>VAT</Label>
            <Select
              key={`${tenantId}-fuel-vat`}
              name="vatEnabled"
              defaultValue={tenant?.vatEnabled ?? true ? "yes" : "no"}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">คิด VAT</SelectItem>
                <SelectItem value="no">ไม่คิด VAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Field
          label="รายละเอียด"
          name="description"
          defaultValue={`ค่าขนส่งน้ำมัน ${activeCycle.label}`}
        />
        <Button type="submit" disabled={!data.tenants.length}>
          ออกใบแจ้งหนี้
        </Button>
      </form>
    </DialogContent>
  );
}

function PaymentDialog({
  data,
  onSubmit,
}: {
  data: DashboardData;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const openInvoices = data.invoices.filter((invoice) => invoice.balance > 0);
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.id ?? "");
  const invoice = data.invoices.find((item) => item.id === invoiceId);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>บันทึกชำระเงิน</DialogTitle>
        <DialogDescription>ออกเลขใบเสร็จหลังบันทึกยอดรับเงิน</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label>ใบแจ้งหนี้</Label>
          <Select name="invoiceId" value={invoiceId} onValueChange={setInvoiceId}>
            <SelectTrigger>
              <SelectValue placeholder="เลือกใบแจ้งหนี้" />
            </SelectTrigger>
            <SelectContent>
              {openInvoices.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.invoiceNo} · {formatCurrency(item.balance)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="ยอดรับ"
            name="amount"
            type="number"
            step="0.01"
            defaultValue={String(invoice?.balance ?? 0)}
          />
          <Field label="วันที่รับ" name="paidAt" type="date" defaultValue={today()} />
          <div className="grid gap-2">
            <Label>ช่องทาง</Label>
            <Select name="method" defaultValue="bank_transfer">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">โอนธนาคาร</SelectItem>
                <SelectItem value="promptpay">พร้อมเพย์</SelectItem>
                <SelectItem value="cash">เงินสด</SelectItem>
                <SelectItem value="other">อื่น ๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="เลขอ้างอิง" name="reference" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="paymentNotes">หมายเหตุ</Label>
          <Textarea id="paymentNotes" name="notes" rows={3} />
        </div>
        <Button type="submit" disabled={!openInvoices.length}>
          บันทึกชำระเงิน
        </Button>
      </form>
    </DialogContent>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  step?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        step={step}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function PrintButton({ href }: { href: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className="size-8">
          <a href={href} target="_blank" rel="noreferrer">
            <Printer className="size-4" />
            <span className="sr-only">พิมพ์เอกสาร</span>
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>พิมพ์เอกสาร</TooltipContent>
    </Tooltip>
  );
}
