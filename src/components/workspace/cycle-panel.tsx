"use client";

import { useState, type FormEvent } from "react";
import { Layers, CalendarDays, CalendarPlus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Label } from "@/components/ui/label";
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
import type { DashboardData, BillingCycle, MeterReading } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/billing";
import {
  EmptyState,
  Info,
  Field,
  cycleStatusText,
  cycleStatusClass,
  addMonths,
  endOfMonth,
  cycleLabel,
  dateInputValue,
} from "./utils";

export function CyclePanel({
  data,
  activeCycle,
  selectedCycleId,
  onSelectCycle,
  onStatusChange,
  onBatchInvoices,
  onCycleSubmit,
}: {
  data: DashboardData;
  activeCycle: BillingCycle | null;
  selectedCycleId: string;
  onSelectCycle: (cycleId: string) => void;
  onStatusChange: (cycleId: string, status: BillingCycle["status"]) => void;
  onBatchInvoices: () => void;
  onCycleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [cycleOpen, setCycleOpen] = useState(false);
  const cycles = [...data.cycles].sort(
    (a, b) =>
      new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime(),
  );
  const activeSummary = activeCycle
    ? getCycleBillingSummary(data, activeCycle.id)
    : null;

  const handleCycleSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onCycleSubmit(e);
    if (ok) {
      setCycleOpen(false);
    }
  };

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
              className="font-mono text-[var(--font-mono)]"
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

      <div className="flex justify-between items-center mt-2">
        <h3 className="text-sm font-semibold text-muted-foreground">รายการรอบบิลทั้งหมด</h3>
        <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm">
              <CalendarPlus className="size-4" />
              รอบบิลใหม่
            </Button>
          </DialogTrigger>
          <CycleDialog
            data={data}
            activeCycle={activeCycle}
            onSubmit={handleCycleSubmitInternal}
          />
        </Dialog>
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
                          selected && "text-primary font-bold",
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
                    <TableCell className="text-right font-mono">
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
  
  const hasMeterImage = (reading: MeterReading) => {
    return Boolean(
      reading.cloudinaryPublicId?.trim() ||
        reading.imageUrl?.trim()
    );
  };

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
