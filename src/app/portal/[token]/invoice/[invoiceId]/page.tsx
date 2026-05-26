import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice-document";
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
import {
  formatCurrency,
  formatDate,
  formatInvoiceType,
} from "@/lib/billing";
import {
  getInvoiceMeterEvidence,
  getPortalInvoiceDocument,
} from "@/lib/dashboard-data";

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
  const meterEvidence = getInvoiceMeterEvidence(portal.data, portal.invoice);

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
          <CardContent className="grid gap-3 sm:grid-cols-5">
            <Info label="วันที่ออก" value={formatDate(portal.invoice.issueDate)} />
            <Info label="ครบกำหนด" value={formatDate(portal.invoice.dueDate)} />
            <Info label="รอบบิล" value={portal.cycle?.label ?? "-"} />
            <Info label="ประเภท" value={formatInvoiceType(portal.invoice.type)} />
            <Info label="สถานะ" value={portal.invoice.status} />
          </CardContent>
        </Card>

        <div className="print-page border border-border bg-white shadow-sm">
          <InvoiceDocument
            data={portal.data}
            invoice={portal.invoice}
            tenant={portal.tenant}
            cycle={portal.cycle}
            meterEvidence={meterEvidence}
          />
        </div>

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
