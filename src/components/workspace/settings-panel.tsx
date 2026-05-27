"use client";

import { useState, type FormEvent } from "react";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardData, RentalUnit } from "@/lib/types";
import { formatCurrency } from "@/lib/billing";
import { Info, Field, getTenant } from "./utils";

export function SettingsPanel({
  data,
  onOrganizationSubmit,
  onRoleSubmit,
  onUnitSubmit,
  onCreateUnit,
}: {
  data: DashboardData;
  onOrganizationSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRoleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUnitSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onCreateUnit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-md border border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">ข้อมูลผู้ออกเอกสาร</CardTitle>
          <CardDescription className="text-xs">ข้อมูลสำหรับแสดงบนใบแจ้งหนี้และใบเสร็จ</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onOrganizationSubmit} className="grid gap-3">
            <Field label="ชื่อบริษัท" name="name" defaultValue={data.organization.name} />
            <Field label="เลขประจำตัวผู้เสียภาษี" name="taxId" defaultValue={data.organization.taxId} />
            <Field label="เบอร์โทรศัพท์" name="phone" defaultValue={data.organization.phone} />
            <Field label="อีเมลติดต่อ" name="email" type="email" defaultValue={data.organization.email} />
            <Field label="อัตราภาษี VAT (%)" name="vatRate" type="number" step="0.01" defaultValue={String(data.organization.vatRate)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="ชื่อบัญชีธนาคาร"
                name="bankAccountName"
                defaultValue={data.organization.bankAccountName}
              />
              <Field
                label="เลขที่บัญชี"
                name="bankAccountNumber"
                defaultValue={data.organization.bankAccountNumber}
              />
              <Field
                label="ธนาคาร"
                name="bankName"
                defaultValue={data.organization.bankName}
              />
              <Field
                label="สาขา"
                name="bankBranch"
                defaultValue={data.organization.bankBranch}
              />
            </div>
            <Field
              label="Line ID สำหรับส่งเอกสาร / แจ้งโอน"
              name="paymentLineId"
              defaultValue={data.organization.paymentLineId}
            />
            <div className="grid gap-2">
              <Label htmlFor="orgAddress">ที่อยู่ผู้ออกเอกสาร</Label>
              <Textarea
                id="orgAddress"
                name="address"
                defaultValue={data.organization.address}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>คิด VAT เป็นค่าเริ่มต้น</Label>
              <Select
                name="vatEnabledDefault"
                defaultValue={data.organization.vatEnabledDefault ? "yes" : "no"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">คิด VAT</SelectItem>
                  <SelectItem value="no">ไม่คิด VAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full mt-2">บันทึกข้อมูลบริษัท</Button>
          </form>
        </CardContent>
      </Card>
      
      <Card className="rounded-md border border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">ผู้ใช้งานในระบบ</CardTitle>
          <CardDescription className="text-xs">สิทธิ์แอดมินและพนักงานผู้บันทึกข้อมูล</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.users.map((user) => (
            <form
              key={user.id}
              onSubmit={onRoleSubmit}
              className="grid gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-center"
            >
              <input type="hidden" name="userId" value={user.id} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground mt-0.5">
                  {user.email}
                </p>
              </div>
              <Select name="role" defaultValue={user.role}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">แอดมิน</SelectItem>
                  <SelectItem value="staff">พนักงาน</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" variant="outline">
                บันทึก
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-md border border-border shadow-xs lg:col-span-2">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-base font-semibold">พื้นที่เช่า / ห้องเช่า</CardTitle>
              <CardDescription className="text-xs">แก้ไขค่าเช่า เรทค่าไฟ และผู้เช่าที่ใช้งานปัจจุบัน</CardDescription>
            </div>
            <UnitAddButton data={data} onCreateUnit={onCreateUnit} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.units.map((unit) => (
            <Card key={unit.id} className="rounded-md border border-border/80 shadow-2xs">
              <CardContent className="grid gap-3 p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{unit.code}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{unit.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {unit.status === "occupied" ? "มีผู้เช่า" : unit.status === "vacant" ? "ห้องว่าง" : "ซ่อมบำรุง"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <Info label="ค่าเช่า/เดือน" value={formatCurrency(unit.rentAmount)} className="font-mono text-[var(--font-mono)]" />
                  <Info label="เรทค่าไฟ" value={`${formatCurrency(unit.electricRate)}/น.`} className="font-mono text-[var(--font-mono)]" />
                </div>
                <div className="border-t border-border/50 pt-3 flex justify-between items-center text-xs text-muted-foreground min-w-0">
                  <span className="truncate">มิเตอร์: {unit.meterSerial || "-"}</span>
                  <UnitEditButton data={data} unit={unit} onUnitSubmit={onUnitSubmit} />
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function UnitEditButton({
  data,
  unit,
  onUnitSubmit,
}: {
  data: DashboardData;
  unit: RentalUnit;
  onUnitSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onUnitSubmit(e);
    if (ok) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-7 text-xs">
          แก้ไขพื้นที่
        </Button>
      </DialogTrigger>
      <UnitDialog data={data} unit={unit} onSubmit={handleSubmit} />
    </Dialog>
  );
}

function UnitAddButton({
  data,
  onCreateUnit,
}: {
  data: DashboardData;
  onCreateUnit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onCreateUnit(e);
    if (ok) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          เพิ่มพื้นที่เช่า
        </Button>
      </DialogTrigger>
      <UnitDialog data={data} onSubmit={handleSubmit} title="เพิ่มพื้นที่เช่า" />
    </Dialog>
  );
}

function UnitDialog({
  data,
  unit,
  onSubmit,
  title = "แก้ไขพื้นที่เช่า",
}: {
  data: DashboardData;
  unit?: RentalUnit;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  title?: string;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>ตั้งค่าขนาด ค่าเช่า เรทค่าไฟ และจับคู่ผู้เช่าของพื้นที่เช่านี้</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        {unit && <input type="hidden" name="unitId" value={unit.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="รหัสพื้นที่ / ห้อง" name="code" defaultValue={unit?.code} placeholder="เช่น A01" />
          <Field label="ชื่อเรียกพื้นที่" name="name" defaultValue={unit?.name} placeholder="เช่น อาคาร A ชั้น 1" />
          <Field
            label="อัตราค่าเช่า (บาท/เดือน)"
            name="rentAmount"
            type="number"
            step="0.01"
            defaultValue={unit ? String(unit.rentAmount) : "0"}
          />
          <Field
            label="อัตราค่าไฟ (บาท/หน่วย)"
            name="electricRate"
            type="number"
            step="0.01"
            defaultValue={unit ? String(unit.electricRate) : "0"}
          />
          <Field
            label="ซีเรียลมิเตอร์ไฟ"
            name="meterSerial"
            defaultValue={unit?.meterSerial}
            placeholder="ระบุรหัสบนตัวมิเตอร์"
          />
          <div className="grid gap-2">
            <Label>สถานะการใช้งาน</Label>
            <Select name="status" defaultValue={unit?.status || "vacant"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="occupied">มีผู้เช่า</SelectItem>
                <SelectItem value="vacant">ว่าง</SelectItem>
                <SelectItem value="maintenance">ซ่อมบำรุง</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>ผู้เช่าปัจจุบัน</Label>
          <Select name="tenantId" defaultValue={unit?.tenantId || ""}>
            <SelectTrigger>
              <SelectValue placeholder="ระบุผู้เข้าเช่าพื้นที่นี้" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">-- ไม่มีผู้เช่า --</SelectItem>
              {data.tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.code} · {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full mt-2">บันทึกพื้นที่เช่า</Button>
      </form>
    </DialogContent>
  );
}
