/* eslint-disable @next/next/no-img-element */

import { formatDate, formatNumber } from "@/lib/billing";
import type { InvoiceMeterEvidence } from "@/lib/dashboard-data";

export function MeterEvidenceSection({
  evidence,
}: {
  evidence: InvoiceMeterEvidence[];
}) {
  if (!evidence.length) return null;

  return (
    <section className="border-t border-border py-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold">รูปมิเตอร์แนบใบวางบิล</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {evidence.map((item) => (
          <div
            key={item.id}
            className="break-inside-avoid overflow-hidden border border-border"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={`รูปมิเตอร์ ${item.unitCode || item.title}`}
                className="aspect-[4/3] w-full bg-muted object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground">
                ไม่มีรูปมิเตอร์แนบ
              </div>
            )}
            <div className="grid gap-2 p-3 text-xs">
              <p className="font-medium">{item.title}</p>
              <div className="grid gap-1 text-muted-foreground">
                <MeterEvidenceRow
                  label="พื้นที่"
                  value={[item.unitCode, item.unitName].filter(Boolean).join(" · ") || "-"}
                />
                <MeterEvidenceRow
                  label="เลขมิเตอร์"
                  value={item.meterSerial || "-"}
                />
                <MeterEvidenceRow
                  label="เลขก่อน"
                  value={formatNumber(item.previousReading)}
                />
                <MeterEvidenceRow
                  label="เลขล่าสุด"
                  value={formatNumber(item.currentReading)}
                />
                <MeterEvidenceRow
                  label="ใช้ไป"
                  value={`${formatNumber(item.usageUnits)} หน่วย`}
                />
                <MeterEvidenceRow
                  label="วันที่ถ่าย"
                  value={formatDate(item.capturedAt)}
                />
              </div>
              {item.warning ? (
                <p className="text-[var(--tone-danger)]">{item.warning}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MeterEvidenceRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
