"use client";

import { useState, useMemo, type FormEvent } from "react";
import { Mail, Plus, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
import { Label } from "@/components/ui/label";
import type { DashboardData, Payment } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/billing";
import {
  EmptyState,
  Info,
  Field,
  PrintButton,
  getTenant,
  methodText,
  today,
} from "./utils";

export function PaymentPanel({
  data,
  cycleId,
  onSendReceipt,
  onVoidPayment,
  onPaymentSubmit,
}: {
  data: DashboardData;
  cycleId: string;
  onSendReceipt: (paymentId: string) => void;
  onVoidPayment: (paymentId: string) => Promise<boolean>;
  onPaymentSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [paymentOpen, setPaymentOpen] = useState(false);

  const handlePaymentSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onPaymentSubmit(e);
    if (ok) {
      setPaymentOpen(false);
    }
  };

  const openInvoicesCount = data.invoices.filter((invoice) => invoice.balance > 0).length;

  return (
    <section className="grid gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-muted-foreground">บันทึกและประวัติการชำระเงิน</h3>
        <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={openInvoicesCount === 0} onClick={() => setPaymentOpen(true)}>
              <Plus className="size-4" />
              บันทึกรับเงิน
            </Button>
          </DialogTrigger>
          <PaymentDialog data={data} onSubmit={handlePaymentSubmitInternal} />
        </Dialog>
      </div>

      <PaymentList
        data={data}
        cycleId={cycleId}
        onSendReceipt={onSendReceipt}
        onVoidPayment={onVoidPayment}
      />
    </section>
  );
}

export function PaymentList({
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
  onVoidPayment?: (paymentId: string) => Promise<boolean>;
}) {
  const payments = useMemo(() => {
    const cycleInvoiceIds = new Set(
      data.invoices
        .filter((invoice) => !cycleId || invoice.cycleId === cycleId)
        .map((invoice) => invoice.id),
    );
    const sourcePayments = data.payments.filter((payment) =>
      cycleInvoiceIds.has(payment.invoiceId),
    );
    return compact ? sourcePayments.slice(0, 4) : sourcePayments;
  }, [data.payments, data.invoices, cycleId, compact]);

  if (!payments.length) return <EmptyState label="ยังไม่มีรายการชำระเงิน" />;

  return (
    <div className="grid gap-3">
      {payments.map((payment) => {
        const invoice = data.invoices.find((item) => item.id === payment.invoiceId);
        const tenant = invoice ? getTenant(data, invoice.tenantId) : undefined;

        return (
          <Card key={payment.id} className="rounded-md border border-border shadow-xs">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs text-muted-foreground">{payment.receiptNo}</p>
                  <Badge variant="outline" className="rounded-sm text-xs">
                    {methodText[payment.method]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm text-foreground">
                  {tenant?.name ?? "-"} · {invoice?.invoiceNo ?? "-"} ·{" "}
                  {formatDate(payment.paidAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <span className="font-mono font-bold text-base text-foreground sm:min-w-32 sm:text-right">
                  {formatCurrency(payment.amount)}
                </span>
                <div className="flex gap-1.5 items-center">
                  {onSendReceipt ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onSendReceipt(payment.id)}
                      title="ส่งใบเสร็จ"
                      className="h-8 w-8"
                    >
                      <Mail className="size-4" />
                    </Button>
                  ) : null}
                  <PrintButton href={`/print/receipt/${payment.id}`} />
                  {onVoidPayment && payment.refundStatus === "none" ? (
                    <VoidPaymentButton
                      payment={payment}
                      onVoidPayment={onVoidPayment}
                    />
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VoidPaymentButton({
  payment,
  onVoidPayment,
}: {
  payment: Payment;
  onVoidPayment: (paymentId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  const handleVoid = async () => {
    const ok = await onVoidPayment(payment.id);
    if (ok) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          ยกเลิก
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive font-bold">ยืนยันการยกเลิกรายการรับเงิน</DialogTitle>
          <DialogDescription className="leading-relaxed text-sm">
            คุณแน่ใจหรือไม่ว่าต้องการยกเลิกใบเสร็จรับเงินเลขที่ **{payment.receiptNo}**? การยกเลิกจะปรับปรุงยอดเงินคงเหลือในใบแจ้งหนี้ให้กลับมามียอดค้างตามเดิม
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>ย้อนกลับ</Button>
          <Button variant="destructive" size="sm" onClick={handleVoid}>ยืนยันยกเลิกรับเงิน</Button>
        </div>
      </DialogContent>
    </Dialog>
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
                  {item.invoiceNo} · {getTenant(data, item.tenantId)?.name ?? ""} · ค้าง {formatCurrency(item.balance)}
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
        <Button type="submit" disabled={!openInvoices.length} className="w-full">
          บันทึกชำระเงิน
        </Button>
      </form>
    </DialogContent>
  );
}
