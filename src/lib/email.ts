import { Resend } from "resend";

let cachedResend: Resend | null = null;

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!cachedResend) {
    cachedResend = new Resend(apiKey);
  }

  return cachedResend;
}

export function getBillingEmailFrom() {
  return process.env.BILLING_EMAIL_FROM ?? "";
}

