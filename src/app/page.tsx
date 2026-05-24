import { BillingWorkspace } from "@/components/billing-workspace";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  const dataKey = [
    data.tenants.length,
    data.units.length,
    data.meterReadings.length,
    data.invoices.length,
    data.payments.length,
  ].join("-");

  return <BillingWorkspace key={dataKey} initialData={data} />;
}
