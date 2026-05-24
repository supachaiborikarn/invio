import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { createSignedImageUrl } from "@/lib/cloudinary";
import { getDashboardData, isCloudinaryConfigured } from "@/lib/dashboard-data";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireAppUser();

  if (!user.ok) {
    return NextResponse.json(
      { message: user.message },
      { status: user.status },
    );
  }

  const { id } = await context.params;
  const data = await getDashboardData();
  const reading = data.meterReadings.find((item) => item.id === id);

  if (!reading) {
    return NextResponse.json({ message: "ไม่พบรูปมิเตอร์" }, { status: 404 });
  }

  if (
    isCloudinaryConfigured() &&
    reading.cloudinaryPublicId &&
    !reading.cloudinaryPublicId.startsWith("demo/")
  ) {
    return NextResponse.redirect(
      createSignedImageUrl(
        reading.cloudinaryPublicId,
        reading.cloudinaryVersion,
      ),
    );
  }

  return NextResponse.redirect(reading.imageUrl);
}
