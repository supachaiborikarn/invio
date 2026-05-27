import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { organizations } from "../src/db/schema";

async function main() {
  const db = getDb();
  const [organization] = await db.select().from(organizations).limit(1);

  if (!organization) {
    throw new Error("No organization found");
  }

  const isWacharakiat = organization.name.includes("วัชรเกียรติ");
  const paymentDetails = isWacharakiat
    ? {
        bankAccountName: "หจก. วัชรเกียรติออยล์",
        bankAccountNumber: "347-0-73533-6",
        bankName: "กรุงไทย",
        bankBranch: "ชากังราว",
        paymentLineId: "be-bie",
      }
    : {
        bankAccountName: "หจก. ศุภชัยบริการ (กำแพงเพชร)",
        bankAccountNumber: "064-3-37097-2",
        bankName: "กสิกร",
        bankBranch: "กำแพงเพชร",
        paymentLineId: "yai_c",
      };

  await db
    .update(organizations)
    .set({
      bankAccountName:
        organization.bankAccountName || paymentDetails.bankAccountName,
      bankAccountNumber:
        organization.bankAccountNumber || paymentDetails.bankAccountNumber,
      bankName: organization.bankName || paymentDetails.bankName,
      bankBranch: organization.bankBranch || paymentDetails.bankBranch,
      paymentLineId: organization.paymentLineId || paymentDetails.paymentLineId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organization.id));

  console.log("organization payment details updated");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
