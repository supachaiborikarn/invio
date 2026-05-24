"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertCircle,
  Banknote,
  Bolt,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Gauge,
  ImageUp,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import {
  createInvoiceForUnitAction,
  createTenantAction,
  recordMeterReadingAction,
  recordPaymentAction,
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

function field(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "").trim();
}

function amountField(form: HTMLFormElement, name: string) {
  return Number(field(form, name).replace(/,/g, "")) || 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const activeCycle = data.cycles[0];
  const tabTriggerClass = "h-8 min-w-0 px-2 text-xs sm:text-sm";

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
    const openInvoices = data.invoices.filter((invoice) =>
      ["issued", "partial", "overdue"].includes(invoice.status),
    );
    const outstanding = openInvoices.reduce(
      (sum, invoice) => sum + invoice.balance,
      0,
    );
    const paidThisCycle = data.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const electricUsage = data.meterReadings.reduce(
      (sum, reading) => sum + reading.usageUnits,
      0,
    );

    return {
      outstanding,
      paidThisCycle,
      electricUsage,
      openInvoiceCount: openInvoices.length,
    };
  }, [data.invoices, data.meterReadings, data.payments]);

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
              ["ผู้เช่า", Users],
              ["มิเตอร์", Gauge],
              ["ใบแจ้งหนี้", ReceiptText],
              ["ชำระเงิน", Banknote],
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
                รอบบิล {activeCycle.label}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                จัดการใบแจ้งหนี้ผู้เช่า
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={meterOpen} onOpenChange={setMeterOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <ImageUp className="size-4" />
                    บันทึกมิเตอร์
                  </Button>
                </DialogTrigger>
                <MeterDialog
                  data={data}
                  activeCycleId={activeCycle.id}
                  isUploading={isUploading}
                  uploadMessage={uploadMessage}
                  uploadResult={uploadResult}
                  onFileChange={handleUpload}
                  onSubmit={handleMeterSubmit}
                />
              </Dialog>
              <Dialog open={rentOpen} onOpenChange={setRentOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="size-4" />
                    ใบค่าเช่า
                  </Button>
                </DialogTrigger>
                <RentInvoiceDialog
                  data={data}
                  activeCycle={activeCycle}
                  onSubmit={handleRentInvoiceSubmit}
                />
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
            <TabsList className="!grid !h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger className={tabTriggerClass} value="overview">
                ภาพรวม
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
              <TabsTrigger className={tabTriggerClass} value="settings">
                ตั้งค่า
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" id="ภาพรวม" className="mt-4">
              <OverviewPanel data={data} />
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
              <TenantList data={data} tenants={filteredTenants} />
            </TabsContent>

            <TabsContent value="meters" id="มิเตอร์" className="mt-4">
              <MeterList data={data} />
            </TabsContent>

            <TabsContent value="invoices" id="ใบแจ้งหนี้" className="mt-4">
              <InvoiceList data={data} />
            </TabsContent>

            <TabsContent value="payments" id="ชำระเงิน" className="mt-4">
              <PaymentList data={data} />
            </TabsContent>

            <TabsContent value="settings" id="ตั้งค่า" className="mt-4">
              <SettingsPanel data={data} />
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
  ];

  return (
    <section className="grid gap-2 md:grid-cols-3">
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

function OverviewPanel({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <InvoiceList data={data} compact />
      <div className="grid gap-4">
        <MeterList data={data} compact />
        <PaymentList data={data} compact />
      </div>
    </section>
  );
}

function TenantList({
  data,
  tenants,
}: {
  data: DashboardData;
  tenants: Tenant[];
}) {
  if (!tenants.length) return <EmptyState label="ยังไม่มีผู้เช่า" />;

  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-2">
      {tenants.map((tenant) => {
        const unit = data.units.find((item) => item.tenantId === tenant.id);

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
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function MeterList({
  data,
  compact,
}: {
  data: DashboardData;
  compact?: boolean;
}) {
  const readings = compact ? data.meterReadings.slice(0, 3) : data.meterReadings;

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
  compact,
}: {
  data: DashboardData;
  compact?: boolean;
}) {
  const invoices = compact ? data.invoices.slice(0, 5) : data.invoices;

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
              <TableHead className="w-12"></TableHead>
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
                    <PrintButton href={`/print/invoice/${invoice.id}`} />
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
                <Button asChild variant="outline" size="sm">
                  <a href={`/print/invoice/${invoice.id}`}>
                    <Printer className="size-4" />
                    พิมพ์
                  </a>
                </Button>
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
  compact,
}: {
  data: DashboardData;
  compact?: boolean;
}) {
  const payments = compact ? data.payments.slice(0, 4) : data.payments;

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
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SettingsPanel({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลผู้ออกเอกสาร</CardTitle>
          <CardDescription>ใช้ในใบแจ้งหนี้และใบเสร็จ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Info label="ชื่อ" value={data.organization.name} />
          <Info label="เลขประจำตัวผู้เสียภาษี" value={data.organization.taxId} />
          <Info label="VAT เริ่มต้น" value={`${data.organization.vatRate}%`} />
          <Info label="ที่อยู่" value={data.organization.address} />
        </CardContent>
      </Card>
      <Card className="rounded-md">
        <CardHeader>
          <CardTitle className="text-base">ผู้ใช้ระบบ</CardTitle>
          <CardDescription>สิทธิ์แอดมินและพนักงาน</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <Badge variant="outline" className="rounded-sm">
                {user.role === "admin" ? "แอดมิน" : "พนักงาน"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function TenantDialog({
  onSubmit,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>เพิ่มผู้เช่า</DialogTitle>
        <DialogDescription>ข้อมูลนี้ใช้ผูกพื้นที่และออกเอกสาร</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="รหัสผู้เช่า" name="code" placeholder="T-003" />
          <Field label="ชื่อผู้เช่า" name="name" required />
          <Field label="ผู้ติดต่อ" name="contactName" />
          <Field label="โทร" name="phone" />
          <Field label="อีเมล" name="email" type="email" />
          <Field label="เลขภาษี" name="taxId" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="billingAddress">ที่อยู่สำหรับออกบิล</Label>
          <Textarea id="billingAddress" name="billingAddress" rows={3} />
        </div>
        <div className="grid gap-2">
          <Label>VAT</Label>
          <Select name="vatEnabled" defaultValue="yes">
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
