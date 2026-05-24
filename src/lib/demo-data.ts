import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
} from "@/lib/billing";
import type { DashboardData, Invoice, InvoiceItem, MeterReading } from "@/lib/types";

const rentItemA: InvoiceItem = {
  id: "item-rent-a",
  type: "rent",
  description: "ค่าเช่าพื้นที่ A-01 เดือนพฤษภาคม 2569",
  quantity: 1,
  unitPrice: 18000,
  amount: 18000,
};

const electricA = calculateElectricityCharge({
  previousReading: 12880,
  currentReading: 13245,
  rate: 6.5,
});

const electricItemA: InvoiceItem = {
  id: "item-electric-a",
  type: "electricity",
  description: "ค่าไฟพื้นที่ A-01 365 หน่วย",
  quantity: electricA.usageUnits,
  unitPrice: 6.5,
  amount: electricA.amount,
  meterReadingId: "reading-a",
};

const invoiceTotalsA = calculateInvoiceTotals({
  items: [rentItemA, electricItemA],
  vatEnabled: true,
  vatRate: 7,
  paid: 10000,
});

const rentItemB: InvoiceItem = {
  id: "item-rent-b",
  type: "rent",
  description: "ค่าเช่าพื้นที่ B-12 เดือนพฤษภาคม 2569",
  quantity: 1,
  unitPrice: 12000,
  amount: 12000,
};

const electricB = calculateElectricityCharge({
  previousReading: 8420,
  currentReading: 8588,
  rate: 7,
});

const electricItemB: InvoiceItem = {
  id: "item-electric-b",
  type: "electricity",
  description: "ค่าไฟพื้นที่ B-12 168 หน่วย",
  quantity: electricB.usageUnits,
  unitPrice: 7,
  amount: electricB.amount,
  meterReadingId: "reading-b",
};

const invoiceTotalsB = calculateInvoiceTotals({
  items: [rentItemB, electricItemB],
  vatEnabled: false,
  paid: 0,
});

const invoices: Invoice[] = [
  {
    id: "invoice-a",
    tenantId: "tenant-a",
    cycleId: "cycle-may",
    invoiceNo: "INV-256905-00001",
    type: "mixed",
    issueDate: "2026-05-24",
    dueDate: "2026-05-31",
    items: [rentItemA, electricItemA],
    subtotal: invoiceTotalsA.subtotal,
    discount: invoiceTotalsA.discount,
    vatEnabled: true,
    vatRate: invoiceTotalsA.vatRate,
    vatAmount: invoiceTotalsA.vatAmount,
    total: invoiceTotalsA.total,
    paid: invoiceTotalsA.paid,
    balance: invoiceTotalsA.balance,
    status: "partial",
    notes: "ชำระบางส่วนแล้ว",
  },
  {
    id: "invoice-b",
    tenantId: "tenant-b",
    cycleId: "cycle-may",
    invoiceNo: "INV-256905-00002",
    type: "mixed",
    issueDate: "2026-05-24",
    dueDate: "2026-05-31",
    items: [rentItemB, electricItemB],
    subtotal: invoiceTotalsB.subtotal,
    discount: invoiceTotalsB.discount,
    vatEnabled: false,
    vatRate: invoiceTotalsB.vatRate,
    vatAmount: invoiceTotalsB.vatAmount,
    total: invoiceTotalsB.total,
    paid: invoiceTotalsB.paid,
    balance: invoiceTotalsB.balance,
    status: "issued",
  },
];

const meterReadings: MeterReading[] = [
  {
    id: "reading-a",
    unitId: "unit-a",
    tenantId: "tenant-a",
    cycleId: "cycle-may",
    previousReading: 12880,
    currentReading: 13245,
    usageUnits: electricA.usageUnits,
    rate: 6.5,
    amount: electricA.amount,
    capturedAt: "2026-05-24T08:30:00.000Z",
    imageUrl:
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=900&q=80",
    cloudinaryPublicId: "demo/meter-a",
    cloudinaryVersion: 1,
  },
  {
    id: "reading-b",
    unitId: "unit-b",
    tenantId: "tenant-b",
    cycleId: "cycle-may",
    previousReading: 8420,
    currentReading: 8588,
    usageUnits: electricB.usageUnits,
    rate: 7,
    amount: electricB.amount,
    capturedAt: "2026-05-24T08:42:00.000Z",
    imageUrl:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
    cloudinaryPublicId: "demo/meter-b",
    cloudinaryVersion: 1,
  },
];

export const demoDashboardData: DashboardData = {
  organization: {
    id: "org-demo",
    name: "บริษัท ตัวอย่าง พร็อพเพอร์ตี้ จำกัด",
    taxId: "0105569000000",
    address: "99/9 ถนนตัวอย่าง แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110",
    phone: "02-000-0000",
    email: "billing@example.com",
    vatRate: 7,
    vatEnabledDefault: true,
  },
  users: [
    {
      id: "user-admin",
      name: "ผู้ดูแลระบบ",
      email: "admin@example.com",
      role: "admin",
    },
    {
      id: "user-staff",
      name: "พนักงานบัญชี",
      email: "staff@example.com",
      role: "staff",
    },
  ],
  tenants: [
    {
      id: "tenant-a",
      code: "T-001",
      name: "ร้านกาแฟต้นไม้",
      contactName: "คุณมะลิ",
      taxId: "1103700000000",
      phone: "089-000-1111",
      email: "tenant-a@example.com",
      billingAddress: "พื้นที่ A-01 อาคารตัวอย่าง",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-b",
      code: "T-002",
      name: "สตูดิโอแสงเหนือ",
      contactName: "คุณวิน",
      taxId: "",
      phone: "088-000-2222",
      email: "tenant-b@example.com",
      billingAddress: "พื้นที่ B-12 อาคารตัวอย่าง",
      vatEnabled: false,
      status: "active",
    },
  ],
  units: [
    {
      id: "unit-a",
      code: "A-01",
      name: "พื้นที่ A-01",
      tenantId: "tenant-a",
      rentAmount: 18000,
      electricRate: 6.5,
      meterSerial: "MEA-0001",
      status: "occupied",
    },
    {
      id: "unit-b",
      code: "B-12",
      name: "พื้นที่ B-12",
      tenantId: "tenant-b",
      rentAmount: 12000,
      electricRate: 7,
      meterSerial: "MEA-0012",
      status: "occupied",
    },
  ],
  cycles: [
    {
      id: "cycle-may",
      label: "พฤษภาคม 2569",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      dueDate: "2026-05-31",
      status: "open",
    },
  ],
  meterReadings,
  invoices,
  payments: [
    {
      id: "payment-a",
      invoiceId: "invoice-a",
      receiptNo: "RCPT-256905-00001",
      paidAt: "2026-05-24",
      amount: 10000,
      method: "bank_transfer",
      reference: "SCB 240526",
      notes: "เงินโอนรอบแรก",
    },
  ],
  databaseConfigured: false,
  cloudinaryConfigured: false,
  clerkConfigured: false,
};
