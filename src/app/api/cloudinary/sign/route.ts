import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAppUser } from "@/lib/auth";
import { createUploadSignature, getCloudinaryConfig } from "@/lib/cloudinary";

const requestSchema = z
  .object({
    publicId: z.string().trim().min(1).max(180).optional(),
  })
  .optional();

export async function POST(request: Request) {
  const user = await requireAppUser();

  if (!user.ok) {
    return NextResponse.json(
      { message: user.message },
      { status: user.status },
    );
  }

  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า Cloudinary" },
      { status: 503 },
    );
  }

  const body = requestSchema.safeParse(await request.json().catch(() => ({})));

  if (!body.success) {
    return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  return NextResponse.json(createUploadSignature(body.data));
}
