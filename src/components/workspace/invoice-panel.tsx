"use client";

import { useState, useMemo, type FormEvent } from "react";
import { AlertCircle, Mail, Pencil, Plus, Trash2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardData, Invoice, InvoiceItem, InvoiceType } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  formatInvoiceType,
  formatNumber,
} from "@/lib/billing";
import {
  EmptyState,
  Info,
  Field,
  PrintButton,
  getTenant,
  getUnit,
  invoiceStatusBadge,
  invoiceTypeBadge,
  dateInputValue,
  editableInvoiceTypes,
  today,
  createFuelTripRow,
  normalizeFuelTripRows,
  createInvoiceEditRow,
  normalizeInvoiceEditRows,
  FuelTripFormRow,
  InvoiceEditFormRow,
} from "./utils";

export function InvoicePanel({
  data,
  cycleId,
  onUpdateInvoice,
  onSendInvoice,
  onSendReminder,
  onVoidInvoice,
  onRentSubmit,
  onFuelTransportSubmit,
}: {
  data: DashboardData;
  cycleId: string;
  onUpdateInvoice: (formData: FormData) => Promise<boolean>;
  onSendInvoice: (invoiceId: string) => void;
  onSendReminder: (invoiceId: string) => void;
  onVoidInvoice: (invoiceId: string) => Promise<boolean>;
  onRentSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onFuelTransportSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [rentOpen, setRentOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const activeCycle = data.cycles.find((c) => c.id === cycleId) || null;

  const handleRentSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onRentSubmit(e);
    if (ok) {
      setRentOpen(false);
    }
  };

  const handleFuelSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onFuelTransportSubmit(e);
    if (ok) {
      setFuelOpen(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-muted-foreground">เอกสารเรียกเก็บเงินประจำรอบบิล</h3>
        {activeCycle && activeCycle.status !== "closed" && (
          <div className="flex gap-2">
            <Dialog open={rentOpen} onOpenChange={setRentOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" onClick={() => setRentOpen(true)}>
                  <Plus className="size-4" />
                  ใบค่าเช่า
                </Button>
              </DialogTrigger>
              <RentInvoiceDialog
                data={data}
                activeCycle={activeCycle}
                onSubmit={handleRentSubmitInternal}
              />
            </Dialog>
            <Dialog open={fuelOpen} onOpenChange={setFuelOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" onClick={() => setFuelOpen(true)}>
                  <Plus className="size-4" />
                  ใบขนส่งน้ำมัน
                </Button>
              </DialogTrigger>
              <FuelTransportInvoiceDialog
                data={data}
                activeCycle={activeCycle}
                onSubmit={handleFuelSubmitInternal}
              />
            </Dialog>
          </div>
        )}
      </div>

      <InvoiceList
        data={data}
        cycleId={cycleId}
        onUpdateInvoice={onUpdateInvoice}
        onSendInvoice={onSendInvoice}
        onSendReminder={onSendReminder}
        onVoidInvoice={onVoidInvoice}
      />
    </section>
  );
}

export function InvoiceList({
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
  onVoidInvoice?: (invoiceId: string) => Promise<boolean>;
}) {
  const invoices = useMemo(() => {
    const sourceInvoices = cycleId
      ? data.invoices.filter((invoice) => invoice.cycleId === cycleId)
      : data.invoices;
    return compact ? sourceInvoices.slice(0, 5) : sourceInvoices;
  }, [data.invoices, cycleId, compact]);

  if (!invoices.length) return <EmptyState label="ยังไม่มีใบแจ้งหนี้" />;

  if (compact) {
    return (
      <section className="grid gap-3">
        {invoices.map((invoice) => {
          const tenant = getTenant(data, invoice.tenantId);

          return (
            <Card key={invoice.id} className="rounded-md border border-border shadow-xs">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {invoice.invoiceNo}
                    </span>
                    {invoiceTypeBadge(invoice.type)}
                    {invoiceStatusBadge(invoice.status)}
                  </div>
                  <p className="mt-1 truncate text-sm text-foreground">
                    {tenant?.name ?? "-"} · ครบกำหนด {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <div className="grid gap-1 text-sm sm:min-w-44 sm:text-right font-mono text-[var(--font-mono)]">
                  <span className="font-semibold text-foreground">
                    {formatCurrency(invoice.total)}
                  </span>
                  <span className="text-muted-foreground text-xs">
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
              <TableHead className="w-48"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="font-sans">
            {invoices.map((invoice) => {
              const tenant = getTenant(data, invoice.tenantId);

              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">
                    {invoice.invoiceNo}
                  </TableCell>
                  <TableCell className="font-medium">{tenant?.name ?? "-"}</TableCell>
                  <TableCell>{invoiceTypeBadge(invoice.type)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>{invoiceStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right font-semibold font-mono text-[var(--font-mono)]">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right font-semibold font-mono text-[var(--font-mono)] text-destructive">
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
                          className="h-8 w-8"
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
                          className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                        >
                          <AlertCircle className="size-4" />
                        </Button>
                      ) : null}
                      {onVoidInvoice && invoice.status !== "void" ? (
                        <VoidInvoiceButton
                          invoice={invoice}
                          onVoidInvoice={onVoidInvoice}
                        />
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
            <Card key={invoice.id} className="rounded-md border border-border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base font-semibold">
                      {invoice.invoiceNo}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">{tenant?.name ?? "-"}</CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {invoiceTypeBadge(invoice.type)}
                    {invoiceStatusBadge(invoice.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="ยอดรวม" value={formatCurrency(invoice.total)} className="font-mono text-[var(--font-mono)]" />
                  <Info label="ค้างชำระ" value={formatCurrency(invoice.balance)} className="font-mono text-[var(--font-mono)]" />
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
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
                      className="border-amber-200 text-amber-600 hover:bg-amber-50"
                      onClick={() => onSendReminder(invoice.id)}
                    >
                      ส่งเตือน
                    </Button>
                  ) : null}
                  {onVoidInvoice && invoice.status !== "void" ? (
                    <VoidInvoiceButton
                      invoice={invoice}
                      onVoidInvoice={onVoidInvoice}
                      buttonVariant="outline"
                    />
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

function VoidInvoiceButton({
  invoice,
  onVoidInvoice,
  buttonVariant = "ghost",
}: {
  invoice: Invoice;
  onVoidInvoice: (invoiceId: string) => Promise<boolean>;
  buttonVariant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);

  const handleVoid = async () => {
    const ok = await onVoidInvoice(invoice.id);
    if (ok) {
      setOpen(false);
    }
  };

  const isOutline = buttonVariant === "outline";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isOutline ? (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => setOpen(true)}
          >
            ยกเลิก
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setOpen(true)}
            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="ยกเลิก"
          >
            <AlertCircle className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive font-bold">ยืนยันการยกเลิกใบแจ้งหนี้</DialogTitle>
          <DialogDescription className="leading-relaxed text-sm">
            คุณแน่ใจหรือไม่ว่าต้องการยกเลิกใบแจ้งหนี้เลขที่ **{invoice.invoiceNo}**? การยกเลิกใบแจ้งหนี้จะเซ็ตยอดค้างเป็น 0 และไม่สามารถเปลี่ยนสถานะกลับคืนมาได้อีก
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ย้อนกลับ</Button>
          <Button variant="destructive" size="sm" onClick={handleVoid}>ยืนยันยกเลิก</Button>
        </div>
      </DialogContent>
    </Dialog>
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
        className={cn(!isOutline && "h-8 w-8")}
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
                  className="mt-6 size-9 text-destructive"
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">ลบรายการ</span>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">
            <span className="text-muted-foreground font-normal">รวมก่อน VAT</span>
            <span className="font-mono text-foreground">{formatCurrency(subtotal)}</span>
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
        <Button type="submit" className="w-full">บันทึกการแก้ไข</Button>
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
        <Button type="submit" className="w-full">ออกใบแจ้งหนี้</Button>
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
          <div className="grid gap-3 max-h-[40vh] overflow-y-auto pr-1">
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
                  className="mt-6 size-9 text-destructive"
                  disabled={tripRows.length === 1}
                  onClick={() => removeTripRow(row.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">ลบรอบวิ่ง</span>
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm font-semibold">
            <span className="text-muted-foreground font-normal">รวมก่อน VAT</span>
            <span className="font-mono text-foreground">{formatCurrency(tripSubtotal)}</span>
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
        <Button type="submit" disabled={!data.tenants.length} className="w-full">
          ออกใบแจ้งหนี้
        </Button>
      </form>
    </DialogContent>
  );
}
