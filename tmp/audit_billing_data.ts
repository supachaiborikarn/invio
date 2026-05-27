import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  billingCycles,
  invoiceItems,
  invoices,
  organizations,
  rentalUnits,
  tenants,
} from "../src/db/schema";

async function main() {
  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    throw new Error("No organization found");
  }

  const [tenantRows, unitRows, cycleRows, invoiceRows, itemRows] =
    await Promise.all([
      db.select().from(tenants).where(eq(tenants.organizationId, organization.id)),
      db
        .select()
        .from(rentalUnits)
        .where(eq(rentalUnits.organizationId, organization.id)),
      db
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.organizationId, organization.id)),
      db.select().from(invoices).where(eq(invoices.organizationId, organization.id)),
      db.select().from(invoiceItems),
    ]);

  const itemsByInvoiceId = new Map<string, number>();
  for (const item of itemRows) {
    itemsByInvoiceId.set(
      item.invoiceId,
      (itemsByInvoiceId.get(item.invoiceId) ?? 0) + 1,
    );
  }

  const invoicesByTenantId = new Map<string, typeof invoiceRows>();
  for (const invoice of invoiceRows) {
    const rows = invoicesByTenantId.get(invoice.tenantId) ?? [];
    rows.push(invoice);
    invoicesByTenantId.set(invoice.tenantId, rows);
  }

  console.log(`organization=${organization.name}`);
  console.log(
    `tenants=${tenantRows.length} units=${unitRows.length} cycles=${cycleRows.length} invoices=${invoiceRows.length}`,
  );
  console.log("");

  for (const tenant of tenantRows.sort((a, b) => a.code.localeCompare(b.code))) {
    const tenantInvoices = (invoicesByTenantId.get(tenant.id) ?? []).sort((a, b) =>
      a.invoiceNo.localeCompare(b.invoiceNo),
    );
    const unitCount = unitRows.filter((unit) => unit.tenantId === tenant.id).length;
    console.log(
      `${tenant.code} | units=${unitCount} | invoices=${tenantInvoices.length} | ${tenant.name}`,
    );
    for (const invoice of tenantInvoices) {
      console.log(
        `  - ${invoice.invoiceNo} ${invoice.type} ${invoice.status} total=${(
          invoice.totalSatang / 100
        ).toFixed(2)} items=${itemsByInvoiceId.get(invoice.id) ?? 0}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
