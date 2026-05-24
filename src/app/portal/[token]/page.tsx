import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getTenantPortalData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const statusText = {
  draft: "ร่าง",
  issued: "รอชำระ",
  partial: "จ่ายบางส่วน",
  paid: "จ่ายครบ",
  overdue: "เลยกำหนด",
  void: "ยกเลิก",
};

export default async function TenantPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const portal = await getTenantPortalData(token);

  if (!portal) notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <section className="mx-auto grid w-full max-w-5xl gap-4">
        <Card className="rounded-md">
          <CardHeader>
            <CardDescription>{portal.data.organization.name}</CardDescription>
            <CardTitle className="text-2xl">{portal.tenant.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <Info label="รหัสผู้เช่า" value={portal.tenant.code} />
            <Info label="ผู้ติดต่อ" value={portal.tenant.contactName || "-"} />
            <Info label="โทร" value={portal.tenant.phone || "-"} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold">ใบแจ้งหนี้</h2>
            {portal.invoices.length ? (
              portal.invoices.map((invoice) => (
                <Card key={invoice.id} className="rounded-md">
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">
                          {invoice.invoiceNo}
                        </span>
                        <Badge variant="outline" className="rounded-sm">
                          {statusText[invoice.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        ครบกำหนด {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:min-w-52 sm:text-right">
                      <p className="font-semibold">
                        {formatCurrency(invoice.balance)}
                      </p>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/portal/${token}/invoice/${invoice.id}`}>
                          เปิดใบแจ้งหนี้
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Empty label="ยังไม่มีใบแจ้งหนี้" />
            )}
          </section>

          <section className="grid gap-4">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">ประวัติรับเงิน</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {portal.payments.length ? (
                  portal.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="grid gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs">
                          {payment.receiptNo}
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/portal/${token}/receipt/${payment.id}`}>
                          เปิดใบเสร็จ
                        </Link>
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    ยังไม่มีรายการรับเงิน
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-base">เลขมิเตอร์</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {portal.meterReadings.slice(0, 5).map((reading) => (
                  <div
                    key={reading.id}
                    className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-b-0 last:pb-0"
                  >
                    <span>{formatDate(reading.capturedAt)}</span>
                    <span>{formatNumber(reading.usageUnits)} หน่วย</span>
                  </div>
                ))}
                {!portal.meterReadings.length ? (
                  <p className="text-sm text-muted-foreground">
                    ยังไม่มีเลขมิเตอร์
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

