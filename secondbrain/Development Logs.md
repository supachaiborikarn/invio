# 📜 Development Logs: ประวัติการพัฒนาและแก้ไขงาน

บันทึกประวัติการพัฒนา การอัปเดตฟีเจอร์ และการแก้ไขโค้ดอย่างละเอียด เพื่อให้ทีมและ AI สามารถทำงานต่อยอดได้อย่างไร้รอยต่อ

---

## 📅 บันทึกการแก้ไข (Log History)

### 📌 [2026-05-24] - ตั้งค่า Obsidian Second Brain & ตรวจสอบระบบ
*   **รายละเอียด**:
    *   สร้างระบบ **Obsidian Second Brain** โฟลเดอร์ `secondbrain/` เพื่อบันทึกโครงสร้างระบบ โครงสร้างฐานข้อมูล ประวัติการทำงาน และเป้าหมายต่อไป
    *   สร้างไฟล์เอกสารนำทางหลัก:
        *   `Index.md` — ดัชนีหลักสำหรับคลัง Obsidian
        *   `Project Dashboard.md` — ภาพรวมสถาปัตยกรรมและเทคโนโลยี
        *   `Database Schema.md` — คำอธิบาย Entity และพารามิเตอร์ตาราง Drizzle
        *   `Development Logs.md` — ประวัติการแก้ไขและการเริ่มงาน (หน้านี้)
        *   `Roadmap & Next Steps.md` — สถานะความสำเร็จปัจจุบันและรายการสิ่งที่ต้องทำถัดไป
    *   ทำการตรวจสอบความพร้อมของโปรเจค โดยเช็คไฟล์โครงสร้าง API, UI, Actions, และการเช็ค Git ที่ยังไม่มีการบันทึก Commit แรก

### 📌 [ประวัติย้อนหลังก่อนหน้านี้] - พัฒนาส่วนแกนหลัก (Core Features Implementation)
*   **การเตรียมฐานข้อมูล & Schema**:
    *   เขียนโครงสร้างตาราง `schema.ts` เพื่อรองรับการเก็บหน่วยสตางค์ (Satang Basis)
    *   ใช้ Drizzle Kit เจนเนอเรตและเตรียม Migration แรก (`0000_fresh_starjammers.sql`)
*   **ระบบการเงินและการประมวลผล (`src/lib/billing.ts`)**:
    *   ฟังก์ชัน `calculateElectricityCharge` — ตรวจสอบค่ามิเตอร์ (เช่น ป้องกันค่ามิเตอร์ใหม่ลดลงจากค่ามิเตอร์เดิม, ตรวจสอบการใช้ไฟผิดปกติแบบผิดหูผิดตา และส่ง Warning กลับมา)
    *   ฟังก์ชัน `calculateInvoiceTotals` — คำนวณราคาสุทธิ ส่วนลด ภาษีมูลค่าเพิ่ม (VAT) ในรูปแบบจุดทศนิยมและสตางค์
    *   ฟังก์ชัน `nextRunningNo` — ระบบสุ่ม/รันหมายเลขเอกสารอัตโนมัติ (เช่น INV-YYYYMMNNN, RCPT-YYYYMMNNN)
*   **Server Actions (`src/app/actions.ts`)**:
    *   สร้าง Actions ครบครันสำหรับความสามารถ CRUD: `createTenantAction`, `createUnitAction`, `recordMeterReadingAction`, `createInvoiceForUnitAction`, `recordPaymentAction`
    *   รองรับ Fallback — ตรวจจับหากไม่มีการต่อ Database URL ตัวแอปจะสลับไปใช้ State Demo ภายในเพจให้ผู้ใช้ทดลองเล่นได้โดยไม่พัง
*   **การประกอบหน้าจอ Dashboard (`src/components/billing-workspace.tsx`)**:
    *   รวม Dashboard ฟังก์ชันทั้งหมดมาไว้ที่เดียว แยกด้วยแถบแท็บ (Overview, Tenants, Meters, Invoices, Payments, Settings)
    *   ระบบการอัปโหลดรูปแบบ Signed Upload เข้าสู่ Cloudinary
    *   ระบบกรองและค้นหาผู้เช่า
*   **หน้าพิมพ์เอกสารสไตล์ราชการ/ธุรกิจ (`src/app/print/`)**:
    *   `/print/invoice/[id]` — ใบแจ้งหนี้สำหรับพิมพ์หรือเซฟเป็น PDF
    *   `/print/receipt/[id]` — ใบเสร็จรับเงินสำหรับพิมพ์หรือเซฟเป็น PDF
    *   สร้างแถบเครื่องมือพิมพ์ (`PrintToolbar`) เพื่อช่วยซ่อนปุ่มต่าง ๆ ขณะกดพิมพ์จริงในบราวเซอร์

---
กลับไปหน้าหลัก: [[Index]]
