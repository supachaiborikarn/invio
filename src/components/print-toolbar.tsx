"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  return (
    <div className="no-print flex justify-end gap-2 p-4">
      <Button onClick={() => window.print()}>
        <Printer className="size-4" />
        พิมพ์ / บันทึก PDF
      </Button>
    </div>
  );
}
