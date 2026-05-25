import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenantPortalLinks, tenants } from "@/db/schema";
import { getAppUrl } from "@/lib/dashboard-data";
import { createPortalToken, hashPortalToken } from "@/lib/portal";

export async function createPortalLinkForTenant(
  tenantId: string,
  createdByUserId?: string | null,
) {
  const db = getDb();
  const [tenant] = await db
    .select({
      organizationId: tenants.organizationId,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error("ไม่พบผู้เช่า");
  }

  const token = createPortalToken();
  const tokenHash = hashPortalToken(token);
  const [link] = await db
    .insert(tenantPortalLinks)
    .values({
      organizationId: tenant.organizationId,
      tenantId,
      tokenHash,
      createdByUserId,
    })
    .returning({ id: tenantPortalLinks.id });

  return {
    token,
    tokenHash,
    linkId: link.id,
    url: `${getAppUrl()}/portal/${token}`,
  };
}
