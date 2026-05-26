import type { DashboardData } from "@/lib/types";
import { formatInvoiceType } from "@/lib/billing";

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildReportCsv(data: DashboardData, type: string) {
  if (type === "payments") {
    return toCsv([
      ["receipt_no", "invoice_no", "invoice_type", "tenant", "paid_at", "amount", "method", "provider", "reference"],
      ...data.payments.map((payment) => {
        const invoice = data.invoices.find((item) => item.id === payment.invoiceId);
        const tenant = invoice
          ? data.tenants.find((item) => item.id === invoice.tenantId)
          : undefined;

        return [
          payment.receiptNo,
          invoice?.invoiceNo ?? "",
          invoice ? formatInvoiceType(invoice.type) : "",
          tenant?.name ?? "",
          payment.paidAt,
          payment.amount,
          payment.method,
          payment.provider,
          payment.reference,
        ];
      }),
    ]);
  }

  if (type === "vat") {
    return toCsv([
      ["invoice_no", "invoice_type", "tenant", "issue_date", "subtotal", "vat_rate", "vat_amount", "total"],
      ...data.invoices.map((invoice) => {
        const tenant = data.tenants.find((item) => item.id === invoice.tenantId);
        return [
          invoice.invoiceNo,
          formatInvoiceType(invoice.type),
          tenant?.name ?? "",
          invoice.issueDate,
          invoice.subtotal,
          invoice.vatRate,
          invoice.vatAmount,
          invoice.total,
        ];
      }),
    ]);
  }

  if (type === "meters") {
    return toCsv([
      ["unit", "tenant", "captured_at", "previous", "current", "usage", "rate", "amount", "warning"],
      ...data.meterReadings.map((reading) => {
        const unit = data.units.find((item) => item.id === reading.unitId);
        const tenant = data.tenants.find((item) => item.id === reading.tenantId);
        return [
          unit?.code ?? "",
          tenant?.name ?? "",
          reading.capturedAt,
          reading.previousReading,
          reading.currentReading,
          reading.usageUnits,
          reading.rate,
          reading.amount,
          reading.warning ?? "",
        ];
      }),
    ]);
  }

  if (type === "cycles") {
    return toCsv([
      ["cycle", "status", "period_start", "period_end", "due_date", "invoices", "outstanding"],
      ...data.cycles.map((cycle) => {
        const invoices = data.invoices.filter((invoice) => invoice.cycleId === cycle.id);
        return [
          cycle.label,
          cycle.status,
          cycle.periodStart,
          cycle.periodEnd,
          cycle.dueDate,
          invoices.length,
          invoices.reduce((sum, invoice) => sum + invoice.balance, 0),
        ];
      }),
    ]);
  }

  if (type === "monthly") {
    return toCsv([
      [
        "cycle",
        "period_start",
        "period_end",
        "invoices",
        "invoice_total",
        "paid",
        "outstanding",
        "vat",
      ],
      ...data.cycles.map((cycle) => {
        const cycleInvoices = data.invoices.filter(
          (invoice) => invoice.cycleId === cycle.id,
        );
        const cycleInvoiceIds = new Set(cycleInvoices.map((invoice) => invoice.id));
        const paid = data.payments
          .filter((payment) => cycleInvoiceIds.has(payment.invoiceId))
          .reduce((sum, payment) => sum + payment.amount, 0);

        return [
          cycle.label,
          cycle.periodStart,
          cycle.periodEnd,
          cycleInvoices.length,
          cycleInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
          paid,
          cycleInvoices.reduce((sum, invoice) => sum + invoice.balance, 0),
          cycleInvoices.reduce((sum, invoice) => sum + invoice.vatAmount, 0),
        ];
      }),
    ]);
  }

  return toCsv([
    ["invoice_no", "invoice_type", "tenant", "due_date", "status", "total", "paid", "balance"],
    ...data.invoices.map((invoice) => {
      const tenant = data.tenants.find((item) => item.id === invoice.tenantId);
      return [
        invoice.invoiceNo,
        formatInvoiceType(invoice.type),
        tenant?.name ?? "",
        invoice.dueDate,
        invoice.status,
        invoice.total,
        invoice.paid,
        invoice.balance,
      ];
    }),
  ]);
}
