import { NextResponse } from "next/server";
import { hasDatabase } from "@/db";
import {
  isClerkConfigured,
  isCloudinaryConfigured,
  isResendConfigured,
  isStripeConfigured,
  isStripeWebhookConfigured,
} from "@/lib/dashboard-data";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    database: hasDatabase(),
    cloudinary: isCloudinaryConfigured(),
    clerk: isClerkConfigured(),
    stripe: isStripeConfigured(),
    stripeWebhook: isStripeWebhookConfigured(),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    reminders: Boolean(process.env.REMINDER_API_SECRET || process.env.CRON_SECRET),
  };
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([name]) => name);

  return NextResponse.json(
    {
      ready: missing.length === 0,
      checks,
      optional: {
        resend: isResendConfigured(),
      },
      missing,
    },
    { status: missing.length === 0 ? 200 : 503 },
  );
}
