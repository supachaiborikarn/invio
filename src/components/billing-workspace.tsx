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
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  createBillingCycleAction,
  createInvoiceForUnitAction,
  createTenantAction,
  generateBatchInvoicesAction,
  recordMeterReadingAction,
  recordPaymentAction,
  updateBillingCycleStatusAction,
  createTenantPortalLinkAction,
  revokeTenantPortalLinkAction,
  sendInvoiceEmailAction,
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
  formatNumber,
  nextRunningNo,
} from "@/lib/billing";
import type {
  DashboardData,
  BillingCycle,
  Invoice,
  InvoiceItem,
  MeterReading,
  Payment,
  RentalUnit,
  Tenant,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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

function field(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "").trim();
}

function amountField(form: HTMLFormElement, name: string) {
  return Number(field(form, name).replace(/,/g, "")) || 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function BillingWorkspace({
  initialData,
}: {
  initialData: DashboardData;
}) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [tenantOpen, setTenantOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [rentOpen, setRentOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
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
        router.refresh();
      }
      return;
    }

    const unit = getUnit(data, field(form, "unitId"));
    if (!unit) return;

    const tenant = getTenant(data, unit.tenantId);
    const quantity = 1;
    const unitPrice = amountField(form, "rentAmount") || unit.rentAmount;
    const item: InvoiceItem = {
      id: createId("item"),
      type: "rent",
      description: field(form, "description") || `ค่าเช่าพื้นที่ ${unit.code}`,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    };
    const totalsForInvoice = calculateInvoiceTotals({
      items: [item],
      discount: amountField(form, "discount"),
      vatEnabled: field(form, "vatEnabled") === "yes",
      vatRate: data.organization.vatRate,
    });
    const invoice: Invoice = {
      id: createId("invoice"),
      tenantId: unit.tenantId,
      cycleId: activeCycle.id,
      invoiceNo: nextRunningNo("INV-256905", data.invoices.length),
      type: "rent",
      issueDate: today(),
      dueDate: field(form, "dueDate") || activeCycle.dueDate,
      items: [item],
      vatEnabled: field(form, "vatEnabled") === "yes",
      status: "issued",
      notes: tenant ? `ผู้เช่า ${tenant.name}` : "",
      ...totalsForInvoice,
    };

    setData((current) => ({
      ...current,
      invoices: [invoice, ...current.invoices],
    }));
    form.reset();
    setRentOpen(false);
  }

  async function handleMeterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนบันทึกมิเตอร์");
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
      imageUrl:
        uploadResult?.url ??
        "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=900&q=80",
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

        if (reading) {
          items.push({
            id: createId("item"),
            type: "electricity",
            description: `ค่าไฟพื้นที่ ${unit.code} ${formatNumber(reading.usageUnits)} หน่วย`,
            quantity: reading.usageUnits,
            unitPrice: reading.rate,
            amount: reading.amount,
            meterReadingId: reading.id,
          });
        } else {
          missingMeter += 1;
        }

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
          type: reading ? "mixed" : "rent",
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
        ? `สร้างใบแจ้งหนี้ ${createdCount} ใบ ข้ามซ้ำ ${skippedExisting} ห้อง ไม่มีผู้เช่า ${skippedNoTenant} ห้อง ไม่มีเลขไฟ ${missingMeter} ห้อง`
        : "ยังไม่มีรายการที่สร้างได้ในรอบบิลนี้",
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
                ค่าเช่าและค่าไฟ
              </p>
            </div>
          </div>

          <nav className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-1">
            {[
              ["ภาพรวม", FileText],
              ["รอบบิล", CalendarDays],
              ["ผู้เช่า", Users],
              ["มิเตอร์", Gauge],
              ["ใบแจ้งหนี้", ReceiptText],
              ["ชำระเงิน", Banknote],
              ["รายงาน", BarChart3],
              ["ตั้งค่า", Settings],
            ].map(([label, Icon]) => (
              <a
                href={`#${label}`}
                key={String(label)}
                className="flex min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:justify-start md:text-sm"
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{String(label)}</span>
              </a>
            ))}
          </nav>

          <div className="mt-6 hidden rounded-md border border-border bg-card p-3 text-xs text-muted-foreground md:block">
            <div className="flex items-center gap-2 text-foreground">
              <Building2 className="size-4" />
              <span className="font-medium">{data.organization.name}</span>
            </div>
            <p className="mt-2 leading-6">{data.organization.phone}</p>
            <p>{data.organization.email}</p>
          </div>
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
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CalendarPlus className="size-4" />
                    รอบบิลใหม่
                  </Button>
                </DialogTrigger>
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
                <DialogTrigger asChild>
                  <Button disabled={!activeCycle}>
                    <ImageUp className="size-4" />
                    บันทึกมิเตอร์
                  </Button>
                </DialogTrigger>
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
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!activeCycle}>
                    <Plus className="size-4" />
                    ใบค่าเช่า
                  </Button>
                </DialogTrigger>
                {activeCycle ? (
                  <RentInvoiceDialog
                    data={data}
                    activeCycle={activeCycle}
                    onSubmit={handleRentInvoiceSubmit}
                  />
                ) : null}
              </Dialog>
              <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <CircleDollarSign className="size-4" />
                    รับชำระ
                  </Button>
                </DialogTrigger>
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
              note={`${data.meterReadings.length} รูปมิเตอร์`}
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

          <Tabs defaultValue="overview" className="mt-5">
            <TabsList className="!grid !h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
              <TabsTrigger className={tabTriggerClass} value="overview">
                ภาพรวม
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="cycles">
                รอบบิล
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="tenants">
                ผู้เช่า
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="meters">
                มิเตอร์
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="invoices">
                ใบแจ้งหนี้
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="payments">
                ชำระเงิน
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="reports">
                รายงาน
              </TabsTrigger>
              <TabsTrigger className={tabTriggerClass} value="settings">
                ตั้งค่า
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
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="size-4" />
                      เพิ่มผู้เช่า
                    </Button>
                  </DialogTrigger>
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
                onSendInvoice={handleSendInvoice}
                onVoidInvoice={handleVoidInvoice}
              />
            </TabsContent>

            <TabsContent value="payments" id="ชำระเงิน" className="mt-4">
              <PaymentList
                data={data}
                cycleId={activeCycle?.id ?? ""}
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
      label: "Resend",
      ok: data.resendConfigured,
      text: data.resendConfigured ? "พร้อมส่งอีเมล" : "ยังไม่ตั้งค่า env",
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
  const readingsByUnit = new Set(
    data.meterReadings
      .filter((reading) => reading.cycleId === cycleId)
      .map((reading) => reading.unitId),
  );
  const readyUnits = occupiedUnits.filter(
    (unit) => unit.tenantId && !existingTenantIds.has(unit.tenantId),
  );
  const missingMeter = readyUnits.filter(
    (unit) => !readingsByUnit.has(unit.id),
  ).length;

  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <Info label="พร้อมสร้าง" value={`${readyUnits.length} ห้อง`} />
      <Info label="มีบิลแล้ว" value={`${existingTenantIds.size} ห้อง`} />
      <Info label="ไม่มีเลขไฟ" value={`${missingMeter} ห้อง`} />
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

          return (
            <Card key={reading.id} className="overflow-hidden rounded-md">
              <div className="aspect-[16/10] bg-muted">
                <img
                  src={
                    reading.cloudinaryPublicId?.startsWith("demo/")
                      ? reading.imageUrl
                      : `/api/meter-images/${reading.id}`
                  }
                  alt={`รูปมิเตอร์ ${unit?.code ?? ""}`}
                  className="h-full w-full object-cover"
                />
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
  onSendInvoice,
  onVoidInvoice,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
  onSendInvoice?: (invoiceId: string) => void;
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
                  {invoiceStatusBadge(invoice.status)}
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

function PaymentList({
  data,
  cycleId,
  compact,
  onVoidPayment,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
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
  const reports = [
    ["outstanding", "ยอดค้าง"],
    ["payments", "ยอดรับเงิน"],
    ["vat", "VAT"],
    ["cycles", "รอบบิล"],
    ["meters", "มิเตอร์"],
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
    .filter((reading) => reading.unitId === unitId)
    .sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    )[0];

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>บันทึกมิเตอร์ไฟ</DialogTitle>
        <DialogDescription>กรอกเลขและแนบรูปถ่ายรอบเดือนนี้</DialogDescription>
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
          <Label htmlFor="meterImage">รูปถ่ายมิเตอร์</Label>
          <div className="grid gap-3 rounded-md border border-dashed border-border p-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
              {uploadResult ? (
                <img
                  src={uploadResult.url}
                  alt="ตัวอย่างรูปมิเตอร์"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Upload className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="grid gap-2">
              <Input
                id="meterImage"
                type="file"
                accept="image/*"
                onChange={(event) => onFileChange(event.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                {isUploading ? "กำลังอัปโหลด..." : uploadMessage || "รองรับ JPG, PNG, HEIC"}
              </p>
            </div>
          </div>
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
