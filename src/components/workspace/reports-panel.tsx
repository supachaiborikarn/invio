"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardData } from "@/lib/types";
import { formatCurrency } from "@/lib/billing";
import { Info, EmptyState } from "./utils";

export function ReportsPanel({
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
        <Card className="rounded-md border border-border shadow-xs">
          <CardContent className="p-4">
            <Info label="ยอดบิลรวม" value={formatCurrency(total)} className="font-mono text-[var(--font-mono)]" />
          </CardContent>
        </Card>
        <Card className="rounded-md border border-border shadow-xs">
          <CardContent className="p-4">
            <Info label="ยอดค้างชำระ" value={formatCurrency(outstanding)} className="font-mono text-[var(--font-mono)] text-destructive" />
          </CardContent>
        </Card>
        <Card className="rounded-md border border-border shadow-xs">
          <CardContent className="p-4">
            <Info label="VAT สะสม" value={formatCurrency(vat)} className="font-mono text-[var(--font-mono)]" />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-md border border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Export CSV</CardTitle>
          <CardDescription>ดาวน์โหลดข้อมูลสำหรับการทำบัญชีและตรวจสอบยอด</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {reports.map(([type, label]) => (
            <Button key={type} asChild variant="outline" size="sm">
              <a href={`/api/reports/${type}`}>{label}</a>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-md border border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">รายงานยอดสรุปแต่ละรอบบิล</CardTitle>
          <CardDescription>สรุปยอดบิล ยอดชำระ ยอดค้าง และ VAT แบ่งตามเดือน</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-hidden border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รอบบิล</TableHead>
                  <TableHead className="text-right">จำนวนบิล</TableHead>
                  <TableHead className="text-right">ยอดรวมบิล</TableHead>
                  <TableHead className="text-right">ยอดรับชำระ</TableHead>
                  <TableHead className="text-right">ยอดค้างจ่าย</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyRows.map((row) => (
                  <TableRow key={row.cycle.id}>
                    <TableCell className="font-medium">{row.cycle.label}</TableCell>
                    <TableCell className="text-right font-mono">{row.invoices}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatCurrency(row.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-emerald-600">
                      {formatCurrency(row.paid)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-destructive">
                      {formatCurrency(row.outstanding)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
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
                className="grid gap-2 border border-border p-4 text-sm rounded-md"
              >
                <p className="font-semibold text-sm border-b border-border pb-1.5">{row.cycle.label}</p>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <Info label="ยอดบิลรวม" value={formatCurrency(row.total)} className="font-mono text-[var(--font-mono)]" />
                  <Info label="รับชำระแล้ว" value={formatCurrency(row.paid)} className="font-mono text-[var(--font-mono)] text-emerald-600" />
                  <Info label="ค้างชำระ" value={formatCurrency(row.outstanding)} className="font-mono text-[var(--font-mono)] text-destructive" />
                  <Info label="ภาษี VAT" value={formatCurrency(row.vat)} className="font-mono text-[var(--font-mono)]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
