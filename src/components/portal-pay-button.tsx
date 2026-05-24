"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PortalPayButton({
  token,
  invoiceId,
  disabled,
}: {
  token: string;
  invoiceId: string;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, invoiceId }),
      });
      const result = (await response.json().catch(() => null)) as {
        url?: string;
        message?: string;
      } | null;

      if (!response.ok || !result?.url) {
        throw new Error(result?.message ?? "เริ่มชำระเงินไม่ได้");
      }

      window.location.href = result.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ชำระเงินไม่ได้");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" onClick={startCheckout} disabled={disabled || loading}>
        {loading ? "กำลังเปิดหน้าชำระเงิน..." : "ชำระออนไลน์"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

