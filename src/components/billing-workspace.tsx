"use client";

import {
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  ReceiptText,
  Settings,
  Users,
  Banknote,
  BarChart3,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
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
  updateMeterReadingAction,
  deleteMeterReadingAction,
  createUnitAction,
} from "@/app/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  formatCurrency,
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

// Import panel components from workspace subfolder
import { OverviewPanel } from "./workspace/overview-panel";
import { CyclePanel } from "./workspace/cycle-panel";
import { TenantPanel } from "./workspace/tenant-panel";
import { MeterPanel } from "./workspace/meter-panel";
import { InvoicePanel } from "./workspace/invoice-panel";
import { PaymentPanel } from "./workspace/payment-panel";
import { ReportsPanel } from "./workspace/reports-panel";
import { SettingsPanel } from "./workspace/settings-panel";
import { WorkspaceTab } from "./workspace/utils";
export type { WorkspaceTab };
import {
  tabHref,
  createId,
  field,
  amountField,
  fuelTripItemsFromJson,
  invoiceEditItemsFromJson,
  today,
  inferInvoiceType,
  cycleLabel,
  getUnit,
  getTenant,
  sampleTenantsForDemo,
} from "./workspace/utils";

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

export function BillingWorkspace({
  initialData,
  initialTab = "overview",
}: {
  initialData: DashboardData;
  initialTab?: WorkspaceTab;
}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState("");
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

  async function handleTenantSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
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
        router.refresh();
        return true;
      }
      return false;
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
    };

    if (!tenant.name) return false;

    setData((current) => ({
      ...current,
      tenants: [tenant, ...current.tenants],
    }));
    form.reset();
    return true;
  }

  async function handleTenantUpdate(event: FormEvent<HTMLFormElement>): Promise<boolean> {
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
      return true;
    }

    const result = await updateTenantAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) {
      router.refresh();
    }
    return result.ok;
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

  async function handleRentInvoiceSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนออกใบแจ้งหนี้");
      return false;
    }

    if (data.databaseConfigured) {
      const result = await createInvoiceForUnitAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
      return result.ok;
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
      return false;
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
    return true;
  }

  async function handleInvoiceUpdate(formData: FormData): Promise<boolean> {
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

  async function handleMeterSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!activeCycle) {
      setActionMessage("ต้องสร้างรอบบิลก่อนบันทึกมิเตอร์");
      return false;
    }

    const cloudinarySecureUrl = field(form, "cloudinarySecureUrl");
    const cloudinaryPublicId = field(form, "cloudinaryPublicId");

    if (!cloudinarySecureUrl) {
      setActionMessage("ต้องแนบรูปมิเตอร์ก่อนบันทึกเลขมิเตอร์");
      return false;
    }

    if (
      data.databaseConfigured &&
      (!cloudinaryPublicId || !cloudinarySecureUrl.startsWith("https://"))
    ) {
      setActionMessage("ต้องอัปโหลดรูปเข้า Cloudinary ก่อนบันทึกมิเตอร์");
      return false;
    }

    if (data.databaseConfigured) {
      const result = await recordMeterReadingAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
      return result.ok;
    }

    const unit = getUnit(data, field(form, "unitId"));
    if (!unit) return false;

    const previousReading = amountField(form, "previousReading");
    const currentReading = amountField(form, "currentReading");
    const rate = amountField(form, "rate") || unit.electricRate;
    const calculation = calculateElectricityCharge({
      previousReading,
      currentReading,
      rate,
    });
    
    const previousCloudinarySecureUrl = field(form, "previousCloudinarySecureUrl");
    const previousCloudinaryPublicId = field(form, "previousCloudinaryPublicId");
    const previousCloudinaryAssetId = field(form, "previousCloudinaryAssetId");
    const previousCloudinaryVersion = field(form, "previousCloudinaryVersion");

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
      imageUrl: cloudinarySecureUrl,
      cloudinaryPublicId: cloudinaryPublicId || undefined,
      cloudinaryAssetId: field(form, "cloudinaryAssetId") || undefined,
      cloudinaryVersion: Number(field(form, "cloudinaryVersion")) || undefined,
      previousImageUrl: previousCloudinarySecureUrl || undefined,
      previousCloudinaryPublicId: previousCloudinaryPublicId || undefined,
      previousCloudinaryAssetId: previousCloudinaryAssetId || undefined,
      previousCloudinaryVersion: Number(previousCloudinaryVersion) || undefined,
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
    form.reset();
    return true;
  }

  async function handleMeterUpdate(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;

    if (data.databaseConfigured) {
      const result = await updateMeterReadingAction(
        { ok: false, message: "" },
        new FormData(form),
      );
      setActionMessage(result.message);
      if (result.ok) {
        router.refresh();
      }
      return result.ok;
    }

    const readingId = field(form, "meterReadingId");
    const previousReading = amountField(form, "previousReading");
    const currentReading = amountField(form, "currentReading");
    const rate = amountField(form, "rate");
    const cloudinarySecureUrl = field(form, "cloudinarySecureUrl");

    if (!readingId) return false;

    const calculation = calculateElectricityCharge({
      previousReading,
      currentReading,
      rate,
    });

    setData((current) => {
      const updatedReadings = current.meterReadings.map((r) => {
        if (r.id !== readingId) return r;
        const newReading = {
          ...r,
          previousReading,
          currentReading,
          usageUnits: calculation.usageUnits,
          rate,
          amount: calculation.amount,
          warning: calculation.warning,
        };
        if (cloudinarySecureUrl && cloudinarySecureUrl !== r.imageUrl) {
          newReading.imageUrl = cloudinarySecureUrl;
          newReading.cloudinaryPublicId = field(form, "cloudinaryPublicId") || undefined;
          newReading.cloudinaryAssetId = field(form, "cloudinaryAssetId") || undefined;
          newReading.cloudinaryVersion = Number(field(form, "cloudinaryVersion")) || undefined;
        }
        return newReading;
      });

      const updatedInvoices = current.invoices.map((inv) => {
        if (inv.status === "void" || inv.status === "paid") return inv;

        const hasLinkedItem = inv.items.some((item) => item.meterReadingId === readingId);
        if (!hasLinkedItem) return inv;

        const updatedItems = inv.items.map((item) => {
          if (item.meterReadingId !== readingId) return item;
          return {
            ...item,
            description: `ค่าไฟพื้นที่ ${getUnit(current, readingId)?.code ?? ""} ${formatNumber(calculation.usageUnits)} หน่วย`,
            quantity: calculation.usageUnits,
            unitPrice: rate,
            amount: calculation.amount,
          };
        });

        const totals = calculateInvoiceTotals({
          items: updatedItems,
          discount: inv.discount,
          vatEnabled: inv.vatEnabled,
          vatRate: current.organization.vatRate,
        });

        const nextStatus = deriveInvoiceStatus({
          total: totals.total,
          paid: inv.paid,
          dueDate: inv.dueDate,
          issued: true,
        });

        return {
          ...inv,
          items: updatedItems,
          subtotal: totals.subtotal,
          vatAmount: totals.vatAmount,
          total: totals.total,
          balance: Math.max(totals.total - inv.paid, 0),
          status: nextStatus,
          notes: calculation.warning || inv.notes,
        };
      });

      return {
        ...current,
        meterReadings: updatedReadings,
        invoices: updatedInvoices,
      };
    });

    setActionMessage("แก้ไขเลขมิเตอร์ไฟและปรับปรุงใบแจ้งหนี้ที่เกี่ยวข้องแล้ว");
    return true;
  }

  async function handleMeterDelete(readingId: string): Promise<boolean> {
    if (data.databaseConfigured) {
      const formData = new FormData();
      formData.set("meterReadingId", readingId);
      const result = await deleteMeterReadingAction(
        { ok: false, message: "" },
        formData,
      );
      setActionMessage(result.message);
      if (result.ok) {
        router.refresh();
      }
      return result.ok;
    }

    const reading = data.meterReadings.find((r) => r.id === readingId);
    if (!reading) return false;

    const linkedPaidInvoice = data.invoices.find((inv) =>
      inv.status !== "void" &&
      (inv.status === "paid" || inv.status === "partial") &&
      inv.items.some((item) => item.meterReadingId === readingId)
    );

    if (linkedPaidInvoice) {
      setActionMessage(`ไม่สามารถลบได้ เนื่องจากมีการชำระเงินในใบแจ้งหนี้ ${linkedPaidInvoice.invoiceNo} แล้ว`);
      return false;
    }

    setData((current) => {
      const updatedInvoices = current.invoices.map((inv) => {
        if (inv.status === "void") return inv;

        const hasLinkedItem = inv.items.some((item) => item.meterReadingId === readingId);
        if (!hasLinkedItem) return inv;

        if (inv.items.length <= 1) {
          if (inv.status === "draft") {
            return null;
          } else {
            return {
              ...inv,
              status: "void" as const,
              balance: 0,
            };
          }
        } else {
          const remainingItems = inv.items.filter((item) => item.meterReadingId !== readingId);
          const totals = calculateInvoiceTotals({
            items: remainingItems,
            discount: inv.discount,
            vatEnabled: inv.vatEnabled,
            vatRate: current.organization.vatRate,
          });
          const nextStatus = deriveInvoiceStatus({
            total: totals.total,
            paid: inv.paid,
            dueDate: inv.dueDate,
            issued: true,
          });

          return {
            ...inv,
            items: remainingItems,
            subtotal: totals.subtotal,
            vatAmount: totals.vatAmount,
            total: totals.total,
            balance: Math.max(totals.total - inv.paid, 0),
            status: nextStatus,
          };
        }
      }).filter((inv): inv is Invoice => inv !== null);

      const updatedReadings = current.meterReadings.filter((r) => r.id !== readingId);

      return {
        ...current,
        meterReadings: updatedReadings,
        invoices: updatedInvoices,
      };
    });

    setActionMessage("ลบรายการมิเตอร์และปรับปรุงใบแจ้งหนี้ที่เกี่ยวข้องแล้ว");
    return true;
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
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
        router.refresh();
      }
      return result.ok;
    }

    const invoiceId = field(form, "invoiceId");
    const invoice = data.invoices.find((item) => item.id === invoiceId);
    const amount = amountField(form, "amount");
    if (!invoice || amount <= 0) return false;

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
    return true;
  }

  async function handleCycleSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean> {
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
        router.refresh();
      }
      return result.ok;
    }

    const periodStart = field(form, "periodStart");
    const periodEnd = field(form, "periodEnd");
    const dueDate = field(form, "dueDate");
    const status = (field(form, "status") || "open") as BillingCycle["status"];

    if (!periodStart || !periodEnd || !dueDate) return false;

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
    return true;
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

  async function handleUnitUpdate(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!data.databaseConfigured) {
      setData((current) => ({
        ...current,
        units: current.units.map((unit) =>
          unit.id === field(form, "unitId")
            ? {
                ...unit,
                code: field(form, "code"),
                name: field(form, "name"),
                rentAmount: amountField(form, "rentAmount"),
                electricRate: amountField(form, "electricRate"),
                meterSerial: field(form, "meterSerial"),
                status: (field(form, "status") as RentalUnit["status"]) || "vacant",
                tenantId: field(form, "tenantId") || "",
              }
            : unit,
        ),
      }));
      setActionMessage("แก้ไขข้อมูลพื้นที่เช่าแล้ว");
      return true;
    }

    const result = await updateUnitAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) {
      router.refresh();
    }
    return result.ok;
  }

  async function handleUnitCreate(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    const form = event.currentTarget;

    if (!data.databaseConfigured) {
      const unitId = createId("unit");
      const newUnit: RentalUnit = {
        id: unitId,
        code: field(form, "code"),
        name: field(form, "name"),
        rentAmount: amountField(form, "rentAmount"),
        electricRate: amountField(form, "electricRate"),
        meterSerial: field(form, "meterSerial"),
        status: (field(form, "status") as RentalUnit["status"]) || "vacant",
        tenantId: field(form, "tenantId") || "",
      };
      setData((current) => ({
        ...current,
        units: [...current.units, newUnit],
      }));
      setActionMessage("เพิ่มพื้นที่เช่าแล้ว");
      return true;
    }

    const result = await createUnitAction(
      { ok: false, message: "" },
      new FormData(form),
    );
    setActionMessage(result.message);
    if (result.ok) {
      router.refresh();
    }
    return result.ok;
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

  async function handleVoidInvoice(invoiceId: string): Promise<boolean> {
    const reason = window.prompt("เหตุผลยกเลิกใบแจ้งหนี้");
    if (!reason) return false;
    
    if (!data.databaseConfigured) {
      setData((current) => ({
        ...current,
        invoices: current.invoices.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, status: "void" as const, balance: 0 }
            : inv
        ),
      }));
      setActionMessage("ยกเลิกใบแจ้งหนี้แล้ว");
      return true;
    }

    const formData = new FormData();
    formData.set("invoiceId", invoiceId);
    formData.set("reason", reason);
    const result = await voidInvoiceAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
    return result.ok;
  }

  async function handleVoidPayment(paymentId: string): Promise<boolean> {
    const reason = window.prompt("เหตุผลยกเลิกรายการรับเงิน");
    if (!reason) return false;

    if (!data.databaseConfigured) {
      const payment = data.payments.find((p) => p.id === paymentId);
      if (!payment) return false;

      setData((current) => ({
        ...current,
        payments: current.payments.map((p) =>
          p.id === paymentId ? { ...p, refundStatus: "refunded" as const } : p
        ),
        invoices: current.invoices.map((inv) => {
          if (inv.id !== payment.invoiceId) return inv;
          const paid = Math.max(inv.paid - payment.amount, 0);
          const balance = Math.max(inv.total - paid, 0);
          return {
            ...inv,
            paid,
            balance,
            status: deriveInvoiceStatus({
              total: inv.total,
              paid,
              dueDate: inv.dueDate,
              issued: true,
            }),
          };
        }),
      }));
      setActionMessage("ยกเลิกรายการรับเงินแล้ว");
      return true;
    }

    const formData = new FormData();
    formData.set("paymentId", paymentId);
    formData.set("reason", reason);
    const result = await voidPaymentAction(
      { ok: false, message: "" },
      formData,
    );
    setActionMessage(result.message);
    if (result.ok) router.refresh();
    return result.ok;
  }

  const cycleStatusText: Record<BillingCycle["status"], string> = {
    draft: "ร่าง",
    open: "เปิดใช้งาน",
    closed: "ปิดแล้ว",
  };

  return (
    <main className="min-h-screen bg-background text-foreground font-sans antialiased">
      <div className="mx-auto grid min-h-screen w-full max-w-[1480px] grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="border-b border-border bg-sidebar px-4 py-4 md:min-h-screen md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ReceiptText className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">ระบบใบแจ้งหนี้</p>
              <p className="truncate text-xs text-muted-foreground">ค่าเช่า ค่าไฟ ค่าขนส่งน้ำมัน</p>
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
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
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
              <span className="font-semibold truncate">{data.organization.name}</span>
            </div>
            <p className="mt-2 leading-6">{data.organization.phone}</p>
            <p>{data.organization.email}</p>
          </a>
        </aside>

        {/* Content Area */}
        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                รอบบิล {activeCycle?.label ?? "ยังไม่ได้สร้าง"}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
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
          </header>

          {/* Metrics */}
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
              icon={Gauge}
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

          {/* Config Strip */}
          <ConfigStrip data={data} />

          {/* Action Notification Alert */}
          {actionMessage ? (
            <div className="mt-3 flex items-center gap-2 border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-xs animate-in fade-in duration-300">
              <AlertCircle className="size-4 shrink-0 text-primary" />
              <span>{actionMessage}</span>
            </div>
          ) : null}

          {/* Main Tab Panels */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => selectTab(value as WorkspaceTab)}
            className="mt-5"
          >
            <TabsList className="!grid !h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-8">
              {workspaceTabs.map((item) => (
                <TabsTrigger
                  key={item.value}
                  asChild
                  className={tabTriggerClass}
                  value={item.value}
                >
                  <a
                    href={tabHref(item.value)}
                    onClick={(event) => handleTabLinkClick(event, item.value)}
                  >
                    {item.label}
                  </a>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" id="ภาพรวม" className="mt-4">
              <OverviewPanel data={data} cycleId={activeCycle?.id ?? ""} />
            </TabsContent>

            <TabsContent value="cycles" id="รอบบิล" className="mt-4">
              <CyclePanel
                data={data}
                activeCycle={activeCycle}
                selectedCycleId={selectedCycleId}
                onSelectCycle={setSelectedCycleId}
                onStatusChange={handleCycleStatusChange}
                onBatchInvoices={handleBatchInvoices}
                onCycleSubmit={handleCycleSubmit}
              />
            </TabsContent>

            <TabsContent value="tenants" id="ผู้เช่า" className="mt-4">
              <TenantPanel
                data={data}
                search={search}
                onSearchChange={setSearch}
                onCreateTenant={handleTenantSubmit}
                onUpdateTenant={handleTenantUpdate}
                onImportSampleTenants={handleImportSampleTenants}
                onCreatePortalLink={handlePortalLink}
                onRevokePortalLink={handleRevokePortalLink}
              />
            </TabsContent>

            <TabsContent value="meters" id="มิเตอร์" className="mt-4">
              <MeterPanel
                data={data}
                cycleId={activeCycle?.id ?? ""}
                onMeterSubmit={handleMeterSubmit}
                onUpdateMeterReading={handleMeterUpdate}
                onDeleteMeterReading={handleMeterDelete}
              />
            </TabsContent>

            <TabsContent value="invoices" id="ใบแจ้งหนี้" className="mt-4">
              <InvoicePanel
                data={data}
                cycleId={activeCycle?.id ?? ""}
                onUpdateInvoice={handleInvoiceUpdate}
                onSendInvoice={handleSendInvoice}
                onSendReminder={handleSendReminder}
                onVoidInvoice={handleVoidInvoice}
                onRentSubmit={handleRentInvoiceSubmit}
                onFuelTransportSubmit={handleRentInvoiceSubmit}
              />
            </TabsContent>

            <TabsContent value="payments" id="ชำระเงิน" className="mt-4">
              <PaymentPanel
                data={data}
                cycleId={activeCycle?.id ?? ""}
                onSendReceipt={handleSendReceipt}
                onVoidPayment={handleVoidPayment}
                onPaymentSubmit={handlePaymentSubmit}
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
                onCreateUnit={handleUnitCreate}
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
    <Card className="rounded-md border border-border shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">{value}</div>
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
    <section className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 border border-border bg-card px-3 py-2 text-sm rounded-md shadow-2xs"
        >
          {item.ok ? (
            <CheckCircle2 className="size-4 text-[var(--tone-ok)] shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-[var(--tone-warn)] shrink-0" />
          )}
          <span className="font-semibold shrink-0">{item.label}</span>
          <span className="min-w-0 truncate text-muted-foreground text-xs">
            {item.text}
          </span>
        </div>
      ))}
    </section>
  );
}
