import { auth, currentUser } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import { appUsers, organizations } from "@/db/schema";
import { isClerkConfigured } from "@/lib/dashboard-data";
import type { UserRole } from "@/lib/types";

export type AuthResult =
  | {
      ok: true;
      userId: string;
      appUserId: string | null;
      role: UserRole;
      demo: boolean;
    }
  | { ok: false; status: 401 | 403 | 503; message: string };

async function getDefaultOrganizationId() {
  const db = getDb();
  const [existing] = await db.select().from(organizations).limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(organizations)
    .values({
      name: "องค์กรของฉัน",
      vatRateBasisPoints: 700,
      vatEnabledDefault: true,
    })
    .returning({ id: organizations.id });

  return created.id;
}

function cleanRole(value: unknown): UserRole | null {
  if (value === "admin" || value === "org:admin") return "admin";
  if (value === "staff" || value === "org:staff" || value === "org:member") {
    return "staff";
  }

  return null;
}

export async function requireAppUser(): Promise<AuthResult> {
  if (!isClerkConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        message: "ยังไม่ได้ตั้งค่า Clerk",
      };
    }

    return {
      ok: true,
      userId: "demo-user",
      appUserId: null,
      role: "admin",
      demo: true,
    };
  }

  const session = await auth();

  if (!session.userId) {
    return {
      ok: false,
      status: 401,
      message: "ต้องเข้าสู่ระบบก่อน",
    };
  }

  if (!hasDatabase()) {
    return {
      ok: false,
      status: 503,
      message: "ยังไม่ได้ตั้งค่าฐานข้อมูลสำหรับตรวจสิทธิ์ผู้ใช้",
    };
  }

  const db = getDb();
  const [appUser] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.clerkUserId, session.userId))
    .limit(1);

  if (appUser) {
    return {
      ok: true,
      userId: session.userId,
      appUserId: appUser.id,
      role: appUser.role,
      demo: false,
    };
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appUsers);
  const userCount = Number(countRow?.count ?? 0);

  if (userCount === 0) {
    const clerkUser = await currentUser();
    const organizationId = await getDefaultOrganizationId();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses[0]?.emailAddress ??
      "";
    const name =
      clerkUser?.fullName ??
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ??
      email ??
      "Admin";

    const [created] = await db
      .insert(appUsers)
      .values({
        organizationId,
        clerkUserId: session.userId,
        name,
        email,
        role: "admin",
      })
      .returning({ id: appUsers.id, role: appUsers.role });

    return {
      ok: true,
      userId: session.userId,
      appUserId: created.id,
      role: created.role,
      demo: false,
    };
  }

  const metadata = session.sessionClaims?.metadata as
    | { role?: unknown }
    | undefined;
  const publicMetadata = session.sessionClaims?.publicMetadata as
    | { role?: unknown }
    | undefined;
  const claimRole =
    cleanRole(metadata?.role) ??
    cleanRole(publicMetadata?.role) ??
    cleanRole(session.orgRole);

  if (claimRole) {
    return {
      ok: true,
      userId: session.userId,
      appUserId: null,
      role: claimRole,
      demo: false,
    };
  }

  return {
    ok: false,
    status: 403,
    message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ Admin/Staff",
  };
}
