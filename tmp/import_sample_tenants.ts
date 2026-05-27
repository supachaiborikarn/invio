import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { organizations, tenants } from "../src/db/schema";

const sampleTenants = [
  {
    code: "BNT",
    name: "บริษัท บีเอ็นที เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    taxId: "0505562019812",
    billingAddress:
      "เลขที่ 8 หมู่ที่ 4 ตำบลหนองป่าครั่ง\nอำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50000",
  },
  {
    code: "LAZADA",
    name: "บริษัท ลาซาด้า เอ็กซ์เพรส จำกัด (สำนักงานใหญ่)",
    taxId: "0-1055-58080-77-8",
    billingAddress:
      "689 อาคารภิรัช ชั้นที่ 29 ห้องเลขที่ 2904-2906 ซ.สุขุมวิท 35\nถ.สุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110",
  },
  {
    code: "FLASH",
    name: "บริษัท แฟลช เอ็กซ์เพรส จำกัด สำนักงานใหญ่",
    taxId: "0105560159254",
    billingAddress:
      "เลขที่ 161 อาคารยูนิลีเวอร์ เฮ้าส์ ชั้นที่ 7 และ 8 ถนนพระรามเก้า\nแขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310",
  },
  {
    code: "TAIFAH",
    name: "หจก. ใต้ฟ้าปิโตรเลียม",
    taxId: "",
    billingAddress: "",
  },
  {
    code: "DAOPAISAAN",
    name: "ดาวไพศาล",
    taxId: "",
    billingAddress: "",
  },
] as const;

async function main() {
  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    throw new Error("No organization found");
  }

  const existingRows = await db
    .select({ code: tenants.code })
    .from(tenants)
    .where(eq(tenants.organizationId, organization.id));
  const existingCodes = new Set(existingRows.map((tenant) => tenant.code));
  const newTenants = sampleTenants.filter(
    (tenant) => !existingCodes.has(tenant.code),
  );

  if (!newTenants.length) {
    console.log("sample tenants already exist");
    return;
  }

  await db.insert(tenants).values(
    newTenants.map((tenant) => ({
      organizationId: organization.id,
      code: tenant.code,
      name: tenant.name,
      taxId: tenant.taxId,
      billingAddress: tenant.billingAddress,
      vatEnabled: true,
      status: "active" as const,
    })),
  );

  console.log(`inserted ${newTenants.length} sample tenants`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
