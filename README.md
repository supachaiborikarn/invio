# ระบบใบแจ้งหนี้ค่าเช่า ค่าไฟ และค่าขนส่งน้ำมัน

เว็บแอพสำหรับออกใบแจ้งหนี้ผู้เช่าหลายราย, บันทึกเลขมิเตอร์พร้อมรูปถ่าย, คำนวณค่าไฟตามเรทต่อหน่วย, บันทึกชำระเงิน, และพิมพ์ใบแจ้งหนี้หรือใบเสร็จเป็น PDF ผ่าน browser print.

## คู่มือผู้ใช้ใหม่

อ่านคู่มือผู้ใช้งานได้ที่ [`docs/user-manual.md`](docs/user-manual.md)

## Stack

- Next.js App Router
- Neon Postgres
- Drizzle ORM
- Clerk สำหรับล็อกอินแอดมินและพนักงาน
- Cloudinary สำหรับรูปมิเตอร์แบบ signed upload
- Stripe PromptPay สำหรับรับเงินออนไลน์
- Resend สำหรับส่งลิงก์ใบแจ้งหนี้และใบเสร็จ
- shadcn/ui, Tailwind CSS, Geist, Noto Sans Thai

## ตั้งค่า env

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าเหล่านี้.

```bash
DATABASE_URL=
DATABASE_URL_UNPOOLED=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=meter-readings

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3001
REMINDER_API_SECRET=

# ไม่บังคับ ถ้าไม่ตั้งค่า ระบบจะใช้วิธีคัดลอกลิงก์ส่งเอง
RESEND_API_KEY=
BILLING_EMAIL_FROM=
```

ถ้ายังไม่ตั้งค่า env ระบบจะเปิดหน้า demo ได้ และจะแจ้งสถานะ Neon, Cloudinary, Clerk, Stripe, และอีเมลบนหน้า dashboard.

## คำสั่งหลัก

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:studio
```

## หน้าหลัก

- `/` dashboard จัดการผู้เช่า, พื้นที่, มิเตอร์, ใบแจ้งหนี้, และการชำระเงิน
- `/api/cloudinary/sign` ออก signature สำหรับอัปโหลดรูปมิเตอร์
- `/api/meter-images/[id]` เปิดรูปมิเตอร์ผ่าน route ที่ตรวจสิทธิ์
- `/portal/[token]` หน้า portal ผู้เช่าสำหรับดูบิลและใบเสร็จ
- `/api/health/readiness` ตรวจ env ที่ต้องใช้ก่อนเปิด production เต็มรูปแบบ
- `/api/payments/stripe/checkout` สร้าง Stripe Checkout Session
- `/api/payments/stripe/webhook` รับ webhook จาก Stripe
- `/api/reminders/due` ส่งอีเมลเตือนก่อนครบกำหนดและหลังเลยกำหนด ถ้าไม่ตั้งค่า Resend ระบบจะข้ามและใช้วิธีส่งลิงก์เอง
- `/api/reports/[type]` export รายงาน CSV
- `/print/invoice/[id]` หน้าใบแจ้งหนี้สำหรับพิมพ์หรือบันทึก PDF
- `/print/receipt/[id]` หน้าใบเสร็จสำหรับพิมพ์หรือบันทึก PDF

## ฐานข้อมูล

schema อยู่ที่ `src/db/schema.ts`.

หลังตั้งค่า Neon แล้วให้รัน:

```bash
npm run db:generate
npm run db:migrate
```

ตัวเชื่อมฐานข้อมูลอยู่ที่ `src/db/index.ts` และโหลดตอนใช้งานจริงเพื่อให้ `next build` ผ่านแม้ env ยังไม่ครบ.
