import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  billingCycles,
  invoiceItems,
  invoices,
  meterReadings,
  organizations,
  rentalUnits,
  tenants,
} from "@/db/schema";
import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
  toSatang,
} from "@/lib/billing";

const tenantCode = "SPX";
const unitCode = "SPX";

const billingRows = [
  {
    id: "2569-01",
    monthLabel: "มกราคม 2569",
    invoiceNo: "69/01",
    issueDate: "2026-01-22",
    dueDate: "2026-01-22",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    previousDate: "2025-12-24",
    currentDate: "2026-01-21",
    previousReading: 7155,
    currentReading: 7605,
  },
  {
    id: "2569-02",
    monthLabel: "กุมภาพันธ์ 2569",
    invoiceNo: "69/02",
    issueDate: "2026-02-23",
    dueDate: "2026-02-23",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    previousDate: "2026-01-22",
    currentDate: "2026-02-23",
    previousReading: 7605,
    currentReading: 8182,
  },
  {
    id: "2569-03",
    monthLabel: "มีนาคม 2569",
    invoiceNo: "69/03",
    issueDate: "2026-03-23",
    dueDate: "2026-03-23",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    previousDate: "2026-02-24",
    currentDate: "2026-03-21",
    previousReading: 8182,
    currentReading: 8710,
  },
  {
    id: "2569-04",
    monthLabel: "เมษายน 2569",
    invoiceNo: "69/04",
    issueDate: "2026-04-23",
    dueDate: "2026-04-23",
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    previousDate: "2026-03-22",
    currentDate: "2026-04-22",
    previousReading: 8710,
    currentReading: 9609,
  },
  {
    id: "2569-05",
    monthLabel: "พฤษภาคม 2569",
    invoiceNo: "69/05",
    issueDate: "2026-05-26",
    dueDate: "2026-05-26",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    previousDate: "2026-04-23",
    currentDate: "2026-05-23",
    previousReading: 9609,
    currentReading: 10556,
  },
];

function date(value: string) {
  return new Date(`${value}T00:00:00`);
}

async function main() {
  const db = getDb();
  const [existingOrganization] = await db.select().from(organizations).limit(1);
  const [organization] = existingOrganization
    ? await db
        .update(organizations)
        .set({
          name: "หจก. วัชรเกียรติออยล์",
          taxId: "0-6235-39000-91-1",
          address: "657 ถ.เจริญสุข ต.ในเมือง อ.เมือง จ.กำแพงเพชร 62000",
          phone: "",
          email: "",
          vatRateBasisPoints: 700,
          vatEnabledDefault: true,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, existingOrganization.id))
        .returning()
    : await db
        .insert(organizations)
        .values({
          name: "หจก. วัชรเกียรติออยล์",
          taxId: "0-6235-39000-91-1",
          address: "657 ถ.เจริญสุข ต.ในเมือง อ.เมือง จ.กำแพงเพชร 62000",
          vatRateBasisPoints: 700,
          vatEnabledDefault: true,
        })
        .returning();

  const [tenant] = await db
    .insert(tenants)
    .values({
      organizationId: organization.id,
      code: tenantCode,
      name: "บริษัท เอสพีเอ็กซ์ เอ็กซ์เพรส(ประเทศไทย) จำกัด สำนักงานใหญ่",
      taxId: "0-1055-61164-87-1",
      billingAddress:
        "89 อาคาร เอไอเอ แคปปิตอลเซ็นเตอร์ ชั้น 24 ถ.รัชดาภิเษก\nแขวง ดินแดง เขต ดินแดง กรุงเทพมหานคร 10400",
      vatEnabled: true,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [tenants.organizationId, tenants.code],
      set: {
        name: "บริษัท เอสพีเอ็กซ์ เอ็กซ์เพรส(ประเทศไทย) จำกัด สำนักงานใหญ่",
        taxId: "0-1055-61164-87-1",
        billingAddress:
          "89 อาคาร เอไอเอ แคปปิตอลเซ็นเตอร์ ชั้น 24 ถ.รัชดาภิเษก\nแขวง ดินแดง เขต ดินแดง กรุงเทพมหานคร 10400",
        vatEnabled: true,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  const [unit] = await db
    .insert(rentalUnits)
    .values({
      organizationId: organization.id,
      tenantId: tenant.id,
      code: unitCode,
      name: "Shopee วัชรเกียรติ",
      rentAmountSatang: 0,
      electricRateSatang: toSatang(5),
      status: "occupied",
    })
    .onConflictDoUpdate({
      target: [rentalUnits.organizationId, rentalUnits.code],
      set: {
        tenantId: tenant.id,
        name: "Shopee วัชรเกียรติ",
        rentAmountSatang: 0,
        electricRateSatang: toSatang(5),
        status: "occupied",
        updatedAt: new Date(),
      },
    })
    .returning();

  const [historyCycle] = await db
    .insert(billingCycles)
    .values({
      organizationId: organization.id,
      label: "ประวัติเลขมิเตอร์",
      periodStart: date("2025-12-24"),
      periodEnd: date("2026-05-23"),
      dueDate: date("2026-05-23"),
      status: "closed",
    })
    .onConflictDoUpdate({
      target: [billingCycles.organizationId, billingCycles.label],
      set: {
        periodStart: date("2025-12-24"),
        periodEnd: date("2026-05-23"),
        dueDate: date("2026-05-23"),
        status: "closed",
      },
    })
    .returning();

  for (const row of billingRows) {
    const [existingMarker] = await db
      .select()
      .from(meterReadings)
      .where(
        and(
          eq(meterReadings.organizationId, organization.id),
          eq(meterReadings.unitId, unit.id),
          eq(meterReadings.currentReading, row.previousReading),
          eq(meterReadings.usageUnits, 0),
        ),
      )
      .limit(1);

    if (existingMarker) {
      await db
        .update(meterReadings)
        .set({
          tenantId: tenant.id,
          billingCycleId: historyCycle.id,
          previousReading: row.previousReading,
          currentReading: row.previousReading,
          rateSatang: toSatang(5),
          amountSatang: 0,
          capturedAt: date(row.previousDate),
        })
        .where(eq(meterReadings.id, existingMarker.id));
    } else {
      await db.insert(meterReadings).values({
        organizationId: organization.id,
        unitId: unit.id,
        tenantId: tenant.id,
        billingCycleId: historyCycle.id,
        previousReading: row.previousReading,
        currentReading: row.previousReading,
        usageUnits: 0,
        rateSatang: toSatang(5),
        amountSatang: 0,
        capturedAt: date(row.previousDate),
      });
    }
  }

  for (const row of billingRows) {
    const [cycle] = await db
      .insert(billingCycles)
      .values({
        organizationId: organization.id,
        label: row.monthLabel,
        periodStart: date(row.periodStart),
        periodEnd: date(row.periodEnd),
        dueDate: date(row.dueDate),
        status: row.id === "2569-05" ? "open" : "closed",
      })
      .onConflictDoUpdate({
        target: [billingCycles.organizationId, billingCycles.label],
        set: {
          periodStart: date(row.periodStart),
          periodEnd: date(row.periodEnd),
          dueDate: date(row.dueDate),
          status: row.id === "2569-05" ? "open" : "closed",
        },
      })
      .returning();

    const charge = calculateElectricityCharge({
      previousReading: row.previousReading,
      currentReading: row.currentReading,
      rate: 5,
    });
    const [existingReading] = await db
      .select()
      .from(meterReadings)
      .where(
        and(
          eq(meterReadings.organizationId, organization.id),
          eq(meterReadings.unitId, unit.id),
          eq(meterReadings.currentReading, row.currentReading),
        ),
      )
      .limit(1);
    const [reading] = existingReading
      ? await db
          .update(meterReadings)
          .set({
            tenantId: tenant.id,
            billingCycleId: cycle.id,
            previousReading: row.previousReading,
            currentReading: row.currentReading,
            usageUnits: charge.usageUnits,
            rateSatang: toSatang(5),
            amountSatang: toSatang(charge.amount),
            capturedAt: date(row.currentDate),
          })
          .where(eq(meterReadings.id, existingReading.id))
          .returning()
      : await db
          .insert(meterReadings)
          .values({
            organizationId: organization.id,
            unitId: unit.id,
            tenantId: tenant.id,
            billingCycleId: cycle.id,
            previousReading: row.previousReading,
            currentReading: row.currentReading,
            usageUnits: charge.usageUnits,
            rateSatang: toSatang(5),
            amountSatang: toSatang(charge.amount),
            capturedAt: date(row.currentDate),
          })
          .returning();
    const item = {
      id: "new",
      type: "electricity" as const,
      description: `ค่าไฟฟ้าประจำเดือน ${row.monthLabel}`,
      quantity: charge.usageUnits,
      unitPrice: 5,
      amount: charge.amount,
      meterReadingId: reading.id,
    };
    const totals = calculateInvoiceTotals({
      items: [item],
      vatEnabled: true,
      vatRate: 7,
    });
    const [invoice] = await db
      .insert(invoices)
      .values({
        organizationId: organization.id,
        tenantId: tenant.id,
        billingCycleId: cycle.id,
        invoiceNo: row.invoiceNo,
        type: "electricity",
        issueDate: date(row.issueDate),
        dueDate: date(row.dueDate),
        subtotalSatang: toSatang(totals.subtotal),
        discountSatang: 0,
        vatRateBasisPoints: 700,
        vatEnabled: true,
        vatAmountSatang: toSatang(totals.vatAmount),
        totalSatang: toSatang(totals.total),
        balanceSatang: toSatang(totals.balance),
        status: "issued",
      })
      .onConflictDoUpdate({
        target: [invoices.organizationId, invoices.invoiceNo],
        set: {
          tenantId: tenant.id,
          billingCycleId: cycle.id,
          type: "electricity",
          issueDate: date(row.issueDate),
          dueDate: date(row.dueDate),
          subtotalSatang: toSatang(totals.subtotal),
          discountSatang: 0,
          vatRateBasisPoints: 700,
          vatEnabled: true,
          vatAmountSatang: toSatang(totals.vatAmount),
          totalSatang: toSatang(totals.total),
          balanceSatang: toSatang(totals.balance),
          status: "issued",
          updatedAt: new Date(),
        },
      })
      .returning();

    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    await db.insert(invoiceItems).values({
      invoiceId: invoice.id,
      meterReadingId: reading.id,
      type: "electricity",
      description: item.description,
      quantity: item.quantity,
      unitPriceSatang: toSatang(item.unitPrice),
      amountSatang: toSatang(item.amount),
    });
  }

  console.log("Imported Wacharakiat electricity invoices:", billingRows.length);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
