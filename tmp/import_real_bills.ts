import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  billingCycles,
  invoiceAuditLogs,
  invoiceItems,
  invoices,
  meterReadings,
  organizations,
  payments,
  rentalUnits,
  tenants,
} from "../src/db/schema";

type ImportedItem = {
  type: "rent" | "electricity" | "fuel_transport" | "mixed" | "other";
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  meter?: {
    previousReading: number;
    currentReading: number;
    usageUnits: number;
    rate: number;
  };
};

type ImportedInvoice = {
  source: string;
  sheet: string;
  invoiceNo: string;
  tenantCode: string;
  tenantName: string;
  tenantTaxId: string;
  tenantAddress: string;
  type: "rent" | "electricity" | "fuel_transport" | "mixed" | "other";
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  vatEnabled: boolean;
  discount: number;
  items: ImportedItem[];
};

const thaiMonths = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const unitDefaults: Record<
  string,
  { name: string; rentAmount: number; electricRate: number; meterSerial: string }
> = {
  BNT: {
    name: "พื้นที่ BNT ตามใบวางบิลเดิม",
    rentAmount: 0,
    electricRate: 4.9,
    meterSerial: "BNT-IMPORT",
  },
  LAZADA: {
    name: "พื้นที่ Lazada สลกบาตร",
    rentAmount: 0,
    electricRate: 7,
    meterSerial: "LAZADA-IMPORT",
  },
  FLASH: {
    name: "พื้นที่ Flash Express",
    rentAmount: 29500,
    electricRate: 0,
    meterSerial: "",
  },
  TAIFAH: {
    name: "รอบขนส่ง หจก. ใต้ฟ้าปิโตรเลียม",
    rentAmount: 0,
    electricRate: 0,
    meterSerial: "",
  },
  DAOPAISAAN: {
    name: "รอบขนส่งดาวไพศาล",
    rentAmount: 0,
    electricRate: 0,
    meterSerial: "",
  },
};

function toSatang(value: number) {
  return Math.round(value * 100);
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00+07:00`);
}

function cycleLabel(periodStart: string) {
  const date = dateValue(periodStart);
  return `${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function receiptNoFor(invoiceNo: string) {
  return `IMP-${invoiceNo}`.replace(/\s+/g, "-");
}

function invoiceNoList(rawInvoices: ImportedInvoice[]) {
  const seen = new Map<string, number>();
  return rawInvoices.map((invoice) => {
    const count = seen.get(invoice.invoiceNo) ?? 0;
    seen.set(invoice.invoiceNo, count + 1);
    if (count === 0) return invoice.invoiceNo;
    return `${invoice.invoiceNo}-${count + 1}`;
  });
}

async function main() {
  const importedInvoices = JSON.parse(
    readFileSync("tmp/extracted_real_bills.json", "utf8"),
  ) as ImportedInvoice[];
  const normalizedInvoiceNos = invoiceNoList(importedInvoices);
  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    throw new Error("No organization found");
  }

  const [
    existingTenantRows,
    existingUnitRows,
    existingCycleRows,
    existingInvoiceRows,
  ] = await Promise.all([
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
  ]);

  const tenantsByCode = new Map(existingTenantRows.map((tenant) => [tenant.code, tenant]));
  const unitsByCode = new Map(existingUnitRows.map((unit) => [unit.code, unit]));
  const cyclesByLabel = new Map(existingCycleRows.map((cycle) => [cycle.label, cycle]));
  const existingInvoiceNos = new Set(existingInvoiceRows.map((invoice) => invoice.invoiceNo));

  let createdTenants = 0;
  let updatedTenants = 0;
  let createdUnits = 0;
  let createdCycles = 0;
  let createdInvoices = 0;
  let createdItems = 0;
  let createdMeterReadings = 0;
  let createdPayments = 0;
  let skippedInvoices = 0;

  for (const invoice of importedInvoices) {
    const existingTenant = tenantsByCode.get(invoice.tenantCode);
    if (existingTenant) {
      const nextTaxId = existingTenant.taxId || invoice.tenantTaxId;
      const nextAddress = existingTenant.billingAddress || invoice.tenantAddress;
      if (
        nextTaxId !== existingTenant.taxId ||
        nextAddress !== existingTenant.billingAddress
      ) {
        await db
          .update(tenants)
          .set({
            taxId: nextTaxId,
            billingAddress: nextAddress,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tenants.organizationId, organization.id),
              eq(tenants.id, existingTenant.id),
            ),
          );
        tenantsByCode.set(invoice.tenantCode, {
          ...existingTenant,
          taxId: nextTaxId,
          billingAddress: nextAddress,
        });
        updatedTenants += 1;
      }
      continue;
    }

    const [createdTenant] = await db
      .insert(tenants)
      .values({
        organizationId: organization.id,
        code: invoice.tenantCode,
        name: invoice.tenantName,
        taxId: invoice.tenantTaxId,
        billingAddress: invoice.tenantAddress,
        vatEnabled: false,
        status: "active",
        notes: "นำเข้าจากไฟล์บิลจริงเดิม",
      })
      .returning();
    tenantsByCode.set(invoice.tenantCode, createdTenant);
    createdTenants += 1;
  }

  for (const [code, tenant] of tenantsByCode) {
    if (unitsByCode.has(code) || !unitDefaults[code]) continue;
    const defaults = unitDefaults[code];
    const [createdUnit] = await db
      .insert(rentalUnits)
      .values({
        organizationId: organization.id,
        tenantId: tenant.id,
        code,
        name: defaults.name,
        rentAmountSatang: toSatang(defaults.rentAmount),
        electricRateSatang: toSatang(defaults.electricRate),
        meterSerial: defaults.meterSerial,
        status: "occupied",
      })
      .returning();
    unitsByCode.set(code, createdUnit);
    createdUnits += 1;
  }

  for (let index = 0; index < importedInvoices.length; index += 1) {
    const sourceInvoice = importedInvoices[index];
    const finalInvoiceNo = normalizedInvoiceNos[index];

    if (existingInvoiceNos.has(finalInvoiceNo)) {
      skippedInvoices += 1;
      continue;
    }

    const tenant = tenantsByCode.get(sourceInvoice.tenantCode);
    if (!tenant) {
      throw new Error(`Missing tenant ${sourceInvoice.tenantCode}`);
    }

    const label = cycleLabel(sourceInvoice.periodStart);
    let cycle = cyclesByLabel.get(label);
    if (!cycle) {
      const [createdCycle] = await db
        .insert(billingCycles)
        .values({
          organizationId: organization.id,
          label,
          periodStart: dateValue(sourceInvoice.periodStart),
          periodEnd: dateValue(sourceInvoice.periodEnd),
          dueDate: dateValue(sourceInvoice.dueDate),
          status: "closed",
        })
        .returning();
      cyclesByLabel.set(label, createdCycle);
      cycle = createdCycle;
      createdCycles += 1;
    }

    const subtotal = sourceInvoice.items.reduce((sum, item) => sum + item.amount, 0);
    const total = Math.max(subtotal - sourceInvoice.discount, 0);
    const [createdInvoice] = await db
      .insert(invoices)
      .values({
        organizationId: organization.id,
        tenantId: tenant.id,
        billingCycleId: cycle.id,
        invoiceNo: finalInvoiceNo,
        type: sourceInvoice.type,
        issueDate: dateValue(sourceInvoice.issueDate),
        dueDate: dateValue(sourceInvoice.dueDate),
        subtotalSatang: toSatang(subtotal),
        discountSatang: toSatang(sourceInvoice.discount),
        vatRateBasisPoints: 700,
        vatEnabled: sourceInvoice.vatEnabled,
        vatAmountSatang: 0,
        totalSatang: toSatang(total),
        paidSatang: toSatang(total),
        balanceSatang: 0,
        status: "paid",
        notes: [
          "นำเข้าจากไฟล์บิลจริงเดิม",
          `แหล่งข้อมูล: ${sourceInvoice.source} / ${sourceInvoice.sheet}`,
          finalInvoiceNo === sourceInvoice.invoiceNo
            ? ""
            : `เลขในไฟล์เดิมซ้ำ: ${sourceInvoice.invoiceNo}`,
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .returning();
    createdInvoices += 1;
    existingInvoiceNos.add(finalInvoiceNo);

    const unit = unitsByCode.get(sourceInvoice.tenantCode);
    const itemRows = [];
    for (const item of sourceInvoice.items) {
      let meterReadingId: string | undefined;
      if (item.meter && unit) {
        const [reading] = await db
          .insert(meterReadings)
          .values({
            organizationId: organization.id,
            unitId: unit.id,
            tenantId: tenant.id,
            billingCycleId: cycle.id,
            previousReading: item.meter.previousReading,
            currentReading: item.meter.currentReading,
            usageUnits: item.meter.usageUnits,
            rateSatang: toSatang(item.meter.rate),
            amountSatang: toSatang(item.amount),
            warning: "นำเข้าจากไฟล์เดิม ไม่มีรูปมิเตอร์ในไฟล์",
            capturedAt: dateValue(sourceInvoice.issueDate),
          })
          .returning({ id: meterReadings.id });
        meterReadingId = reading.id;
        createdMeterReadings += 1;
      }

      itemRows.push({
        invoiceId: createdInvoice.id,
        meterReadingId,
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        unitPriceSatang: toSatang(item.unitPrice),
        amountSatang: toSatang(item.amount),
      });
    }

    if (itemRows.length) {
      await db.insert(invoiceItems).values(itemRows);
      createdItems += itemRows.length;
    }

    if (total > 0) {
      await db.insert(payments).values({
        organizationId: organization.id,
        invoiceId: createdInvoice.id,
        receiptNo: receiptNoFor(finalInvoiceNo),
        paidAt: dateValue(sourceInvoice.issueDate),
        amountSatang: toSatang(total),
        method: "bank_transfer",
        provider: "manual",
        reference: "นำเข้าจากไฟล์บิลจริงเดิม",
        notes: `ปิดยอดย้อนหลังจาก ${sourceInvoice.source}`,
      });
      createdPayments += 1;
    }

    await db.insert(invoiceAuditLogs).values({
      organizationId: organization.id,
      invoiceId: createdInvoice.id,
      action: "import_real_bill",
      reason: "นำเข้าบิลจริงจากไฟล์เดิม",
      metadata: JSON.stringify({
        source: sourceInvoice.source,
        sheet: sourceInvoice.sheet,
        originalInvoiceNo: sourceInvoice.invoiceNo,
        importedInvoiceNo: finalInvoiceNo,
      }),
    });
  }

  console.log(`createdTenants=${createdTenants}`);
  console.log(`updatedTenants=${updatedTenants}`);
  console.log(`createdUnits=${createdUnits}`);
  console.log(`createdCycles=${createdCycles}`);
  console.log(`createdInvoices=${createdInvoices}`);
  console.log(`createdItems=${createdItems}`);
  console.log(`createdMeterReadings=${createdMeterReadings}`);
  console.log(`createdPayments=${createdPayments}`);
  console.log(`skippedInvoices=${skippedInvoices}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
