export type UserRole = "admin" | "staff";

export type TenantStatus = "active" | "paused" | "ended";

export type BillingCycleStatus = "draft" | "open" | "closed";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partial"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceType = "rent" | "electricity" | "mixed" | "other";

export type PaymentMethod = "cash" | "bank_transfer" | "promptpay" | "other";

export type Organization = {
  id: string;
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  vatRate: number;
  vatEnabledDefault: boolean;
};

export type Tenant = {
  id: string;
  code: string;
  name: string;
  contactName: string;
  taxId: string;
  phone: string;
  email: string;
  billingAddress: string;
  vatEnabled: boolean;
  status: TenantStatus;
  notes?: string;
};

export type RentalUnit = {
  id: string;
  code: string;
  name: string;
  tenantId: string;
  rentAmount: number;
  electricRate: number;
  meterSerial: string;
  status: "occupied" | "vacant" | "maintenance";
};

export type BillingCycle = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: BillingCycleStatus;
};

export type MeterReading = {
  id: string;
  unitId: string;
  tenantId: string;
  cycleId: string;
  previousReading: number;
  currentReading: number;
  usageUnits: number;
  rate: number;
  amount: number;
  capturedAt: string;
  imageUrl: string;
  cloudinaryPublicId?: string;
  cloudinaryAssetId?: string;
  cloudinaryVersion?: number;
  warning?: string;
};

export type InvoiceItem = {
  id: string;
  type: InvoiceType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  meterReadingId?: string;
};

export type Invoice = {
  id: string;
  tenantId: string;
  cycleId: string;
  invoiceNo: string;
  type: InvoiceType;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  vatRate: number;
  vatEnabled: boolean;
  vatAmount: number;
  total: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  notes?: string;
};

export type Payment = {
  id: string;
  invoiceId: string;
  receiptNo: string;
  paidAt: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  notes?: string;
};

export type DashboardData = {
  organization: Organization;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }>;
  tenants: Tenant[];
  units: RentalUnit[];
  cycles: BillingCycle[];
  meterReadings: MeterReading[];
  invoices: Invoice[];
  payments: Payment[];
  databaseConfigured: boolean;
  cloudinaryConfigured: boolean;
  clerkConfigured: boolean;
};
