import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalPayButton } from "@/components/portal-pay-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate, formatNumber } from "@/lib/billing";
import { getPortalInvoiceDocument } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; invoiceId: string }>;
  searchParams?: Promise<{ payment?: string }>;
}) {
  const { token, invoiceId } = await params;
  const query = await searchParams;
  const portal = await getPortalInvoiceDocument(token, invoiceId);

  if (!portal) notFound();

  const payable =
    portal.invoice.balance > 0 &&
    portal.invoice.status !== "void" &&
    portal.data.stripeConfigured;

  return (
    <main className="min-h-screen bg-muted/50 px-4 py-6 text-foreground">
      <section className="mx-auto grid w-full max-w-[210mm] gap-4">
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/portal/${token}`}>กลับหน้าผู้เช่า</Link>
        </Button>

        {query?.payment === "success" ? (
          <div className="border border-border bg-card px-4 py-3 text-sm">
            ระบบได้รับข้อมูลจาก Stripe แล้ว ใบเสร็จจะขึ้นหลัง webhook ยืนยันยอด
          </div>
        ) : null}
        {query?.payment === "cancel" ? (
          <div className="border border-border bg-card px-4 py-3 text-sm">
            ยกเลิกการชำระเงินแล้ว
          </div>
        ) : null}

        <Card className="rounded-md">
          <CardHeader>
            <CardDescription>{portal.tenant.name}</CardDescription>
            <CardTitle className="text-2xl">
              ใบแจ้งหนี้ {portal.invoice.invoiceNo}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <Info label="วันที่ออก" value={formatDate(portal.invoice.issueDate)} />
            <Info label="ครบกำหนด" value={formatDate(portal.invoice.dueDate)} />
            <Info label="รอบบิล" value={portal.cycle?.label ?? "-"} />
            <Info label="สถานะ" value={portal.invoice.status} />
          </CardContent>
        </Card>

        <article className="print-page border border-border bg-white p-6 shadow-sm sm:p-10">
          <header className="grid gap-6 border-b border-border pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h1 className="text-2xl font-semibold">ใบแจ้งหนี้</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {portal.data.organization.name}
              </p>
              <p className="mt-1 text-sm leading-6">
                {portal.data.organization.address}
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:min-w-56">
              <DocRow label="เลขที่" value={portal.invoice.invoiceNo} mono />
              <DocRow label="ครบกำหนด" value={formatDate(portal.invoice.dueDate)} />
              <DocRow label="รอบบิล" value={portal.cycle?.label ?? "-"} />
            </div>
          </header>

          <section className="grid gap-4 border-b border-border py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">เรียกเก็บจาก</p>
              <h2 className="mt-1 text-lg font-semibold">
                {portal.tenant.name}
              </h2>
              <p className="mt-2 text-sm leading-6">
                {portal.tenant.billingAddress}
              </p>
            </div>
            <div className="grid gap-2 text-sm">
              <DocRow label="รหัสผู้เช่า" value={portal.tenant.code} />
              <DocRow label="ผู้ติดต่อ" value={portal.tenant.contactName || "-"} />
              <DocRow label="โทร" value={portal.tenant.phone || "-"} />
            </div>
          </section>

          <section className="py-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 font-medium">รายการ</th>
                  <th className="py-3 pl-2 text-right font-medium">จำนวน</th>
                  <th className="py-3 pl-2 text-right font-medium">ราคา</th>
                  <th className="py-3 pl-2 text-right font-medium">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {portal.invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/70">
                    <td className="py-3 pr-3">{item.description}</td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right">
                      {formatNumber(item.quantity)}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right font-medium">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="ml-auto grid max-w-sm gap-2 border-t border-border pt-5 text-sm">
            <DocRow label="ยอดก่อนภาษี" value={formatCurrency(portal.invoice.subtotal)} />
            <DocRow label="ส่วนลด" value={formatCurrency(portal.invoice.discount)} />
            <DocRow
              label={`VAT ${portal.invoice.vatEnabled ? portal.invoice.vatRate : 0}%`}
              value={formatCurrency(portal.invoice.vatAmount)}
            />
            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>ยอดสุทธิ</span>
              <span>{formatCurrency(portal.invoice.total)}</span>
            </div>
            <DocRow label="ชำระแล้ว" value={formatCurrency(portal.invoice.paid)} />
            <div className="flex items-center justify-between text-base font-semibold">
              <span>ค้างชำระ</span>
              <span>{formatCurrency(portal.invoice.balance)}</span>
            </div>
          </section>
        </article>

        <Card className="rounded-md">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">ชำระเงิน</CardTitle>
                <CardDescription>
                  ยอดค้าง {formatCurrency(portal.invoice.balance)}
                </CardDescription>
              </div>
              <Badge variant="outline" className="rounded-sm">
                Stripe PromptPay
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PortalPayButton
              token={token}
              invoiceId={portal.invoice.id}
              disabled={!payable}
            />
            {!portal.data.stripeConfigured ? (
              <p className="mt-2 text-sm text-muted-foreground">
                ระบบยังไม่ได้ตั้งค่า Stripe
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DocRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-right"}>{value}</span>
    </div>
  );
}

