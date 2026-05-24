import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { buildReportCsv } from "@/lib/reports";

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string }> },
) {
  const user = await requireAppUser();

  if (!user.ok) {
    return NextResponse.json({ message: user.message }, { status: user.status });
  }

  const { type } = await context.params;
  const csv = buildReportCsv(await getDashboardData(), type);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${type}.csv"`,
    },
  });
}

