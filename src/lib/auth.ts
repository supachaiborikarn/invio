import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/dashboard-data";

export type AuthResult =
  | { ok: true; userId: string; demo: boolean }
  | { ok: false; status: 401 | 503; message: string };

export async function requireAppUser(): Promise<AuthResult> {
  if (!isClerkConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 503,
        message: "ยังไม่ได้ตั้งค่า Clerk",
      };
    }

    return { ok: true, userId: "demo-user", demo: true };
  }

  const session = await auth();

  if (!session.userId) {
    return {
      ok: false,
      status: 401,
      message: "ต้องเข้าสู่ระบบก่อน",
    };
  }

  return { ok: true, userId: session.userId, demo: false };
}
