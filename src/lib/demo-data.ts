import {
  calculateElectricityCharge,
  calculateInvoiceTotals,
} from "@/lib/billing";
import type {
  BillingCycle,
  DashboardData,
  Invoice,
  InvoiceItem,
  MeterReading,
} from "@/lib/types";

const tenantId = "tenant-spx";
const unitId = "unit-spx-shopee";

const billingRows = [
  {
    id: "2569-01",
    monthLabel: "มกราคม 2569",
    invoiceNo: "69/01",
    issueDate: "2026-01-22",
    dueDate: "2026-01-22",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    previousDate: "2025-12-24T00:00:00.000Z",
    currentDate: "2026-01-21T00:00:00.000Z",
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
    previousDate: "2026-01-22T00:00:00.000Z",
    currentDate: "2026-02-23T00:00:00.000Z",
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
    previousDate: "2026-02-24T00:00:00.000Z",
    currentDate: "2026-03-21T00:00:00.000Z",
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
    previousDate: "2026-03-22T00:00:00.000Z",
    currentDate: "2026-04-22T00:00:00.000Z",
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
    previousDate: "2026-04-23T00:00:00.000Z",
    currentDate: "2026-05-23T00:00:00.000Z",
    previousReading: 9609,
    currentReading: 10556,
  },
];

const cycles: BillingCycle[] = billingRows.map((row) => ({
  id: `cycle-${row.id}`,
  label: row.monthLabel,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  dueDate: row.dueDate,
  status: row.id === "2569-05" ? "open" : "closed",
}));

const readings = billingRows.map((row): MeterReading => {
  const charge = calculateElectricityCharge({
    previousReading: row.previousReading,
    currentReading: row.currentReading,
    rate: 5,
  });

  return {
    id: `reading-${row.id}`,
    unitId,
    tenantId,
    cycleId: `cycle-${row.id}`,
    previousReading: row.previousReading,
    currentReading: row.currentReading,
    usageUnits: charge.usageUnits,
    rate: 5,
    amount: charge.amount,
    capturedAt: row.currentDate,
    imageUrl: "",
  };
});

const previousReadingMarkers = billingRows.map((row): MeterReading => ({
  id: `reading-start-${row.id}`,
  unitId,
  tenantId,
  cycleId: "cycle-meter-history",
  previousReading: row.previousReading,
  currentReading: row.previousReading,
  usageUnits: 0,
  rate: 5,
  amount: 0,
  capturedAt: row.previousDate,
  imageUrl: "",
}));

const meterReadings: MeterReading[] = [...previousReadingMarkers, ...readings];

const invoices: Invoice[] = billingRows.map((row) => {
  const reading = readings.find((item) => item.id === `reading-${row.id}`);
  const item: InvoiceItem = {
    id: `item-electric-${row.id}`,
    type: "electricity",
    description: `ค่าไฟฟ้าประจำเดือน ${row.monthLabel}`,
    quantity: reading?.usageUnits ?? 0,
    unitPrice: 5,
    amount: reading?.amount ?? 0,
    meterReadingId: reading?.id,
  };
  const totals = calculateInvoiceTotals({
    items: [item],
    vatEnabled: true,
    vatRate: 7,
  });

  return {
    id: `invoice-${row.id}`,
    tenantId,
    cycleId: `cycle-${row.id}`,
    invoiceNo: row.invoiceNo,
    type: "electricity",
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    items: [item],
    subtotal: totals.subtotal,
    discount: totals.discount,
    vatEnabled: true,
    vatRate: totals.vatRate,
    vatAmount: totals.vatAmount,
    total: totals.total,
    paid: totals.paid,
    balance: totals.balance,
    status: "issued",
  };
});

export const demoDashboardData: DashboardData = {
  organization: {
    id: "org-wacharakiat-oil",
    name: "หจก. วัชรเกียรติออยล์",
    taxId: "0-6235-39000-91-1",
    address: "657 ถ.เจริญสุข ต.ในเมือง อ.เมือง จ.กำแพงเพชร 62000",
    phone: "",
    email: "",
    bankAccountName: "หจก. วัชรเกียรติออยล์",
    bankAccountNumber: "347-0-73533-6",
    bankName: "กรุงไทย",
    bankBranch: "ชากังราว",
    paymentLineId: "be-bie",
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
  ],
  tenants: [
    {
      id: tenantId,
      code: "SPX",
      name: "บริษัท เอสพีเอ็กซ์ เอ็กซ์เพรส(ประเทศไทย) จำกัด สำนักงานใหญ่",
      contactName: "",
      taxId: "0-1055-61164-87-1",
      phone: "",
      email: "",
      billingAddress:
        "89 อาคาร เอไอเอ แคปปิตอลเซ็นเตอร์ ชั้น 24 ถ.รัชดาภิเษก\nแขวง ดินแดง เขต ดินแดง กรุงเทพมหานคร 10400",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-bnt",
      code: "BNT",
      name: "บริษัท บีเอ็นที เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
      contactName: "",
      taxId: "0505562019812",
      phone: "",
      email: "",
      billingAddress:
        "เลขที่ 8 หมู่ที่ 4 ตำบลหนองป่าครั่ง\nอำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50000",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-lazada",
      code: "LAZADA",
      name: "บริษัท ลาซาด้า เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
      contactName: "",
      taxId: "0-1055-58080-77-8",
      phone: "",
      email: "",
      billingAddress:
        "689 อาคารภิรัช ชั้นที่ 29 ห้องเลขที่ 2904-2906 ซ.สุขุมวิท 35\nถ.สุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-flash",
      code: "FLASH",
      name: "บริษัท แฟลช เอ็กซ์เพรส จำกัด สำนักงานใหญ่",
      contactName: "",
      taxId: "0105560159254",
      phone: "",
      email: "",
      billingAddress:
        "เลขที่ 161 อาคารยูนิลีเวอร์ เฮ้าส์ ชั้นที่ 7 และ 8 ถนนพระรามเก้า\nแขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-taifah",
      code: "TAIFAH",
      name: "หจก. ใต้ฟ้าปิโตรเลียม",
      contactName: "",
      taxId: "",
      phone: "",
      email: "",
      billingAddress: "",
      vatEnabled: true,
      status: "active",
    },
    {
      id: "tenant-daopaisaan",
      code: "DAOPAISAAN",
      name: "ดาวไพศาล",
      contactName: "",
      taxId: "",
      phone: "",
      email: "",
      billingAddress: "",
      vatEnabled: true,
      status: "active",
    },
  ],
  units: [
    {
      id: unitId,
      code: "SPX",
      name: "Shopee วัชรเกียรติ",
      tenantId,
      rentAmount: 0,
      electricRate: 5,
      meterSerial: "",
      status: "occupied",
    },
  ],
  cycles,
  meterReadings,
  invoices,
  payments: [],
  portalLinks: [
    {
      id: "portal-link-spx",
      tenantId,
      label: "ลิงก์ตัวอย่าง",
      active: true,
      createdAt: "2026-05-26T00:00:00.000Z",
    },
  ],
  paymentSessions: [],
  paymentEvents: [],
  invoiceAuditLogs: [],
  databaseConfigured: false,
  cloudinaryConfigured: false,
  clerkConfigured: false,
  stripeConfigured: false,
  resendConfigured: false,
  appUrl: "http://localhost:3001",
};
