import { BillingWorkspace } from "@/components/billing-workspace";
import { requireAppUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireAppUser();

  if (!user.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section className="w-full max-w-md border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">เข้าใช้งานไม่ได้</p>
          <h1 className="mt-2 text-xl font-semibold">{user.message}</h1>
        </section>
      </main>
    );
  }

  const data = await getDashboardData();
  const dataKey = [
    data.cycles.map((cycle) => `${cycle.id}:${cycle.status}`).join("|"),
    data.tenants.length,
    data.units.length,
    data.meterReadings.length,
    data.invoices.length,
    data.payments.length,
  ].join("-");

  return <BillingWorkspace key={dataKey} initialData={data} />;
}
