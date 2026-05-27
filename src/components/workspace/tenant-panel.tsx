"use client";

import { useState, type FormEvent } from "react";
import { Link2, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardData, Tenant } from "@/lib/types";
import { formatCurrency } from "@/lib/billing";
import { EmptyState, Info, Field } from "./utils";

export function TenantPanel({
  data,
  search,
  onSearchChange,
  onCreateTenant,
  onUpdateTenant,
  onImportSampleTenants,
  onCreatePortalLink,
  onRevokePortalLink,
}: {
  data: DashboardData;
  search: string;
  onSearchChange: (value: string) => void;
  onCreateTenant: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateTenant: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onImportSampleTenants: () => void;
  onCreatePortalLink: (tenantId: string) => void;
  onRevokePortalLink: (linkId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const filteredTenants = data.tenants.filter((tenant) => {
    const query = search.toLowerCase();
    if (!query) return true;
    return [tenant.code, tenant.name, tenant.contactName, tenant.phone, tenant.email]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onCreateTenant(e);
    if (ok) {
      setAddOpen(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาผู้เช่า"
            className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onImportSampleTenants}
            >
              <Upload className="size-4" />
              เติมลูกค้าตัวอย่าง
            </Button>
            <DialogTrigger asChild>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                เพิ่มผู้เช่า
              </Button>
            </DialogTrigger>
          </div>
          <TenantDialog onSubmit={handleCreateSubmit} />
        </Dialog>
      </div>

      <TenantList
        data={data}
        tenants={filteredTenants}
        onCreatePortalLink={onCreatePortalLink}
        onRevokePortalLink={onRevokePortalLink}
        onUpdateTenant={onUpdateTenant}
      />
    </section>
  );
}

function TenantList({
  data,
  tenants,
  onCreatePortalLink,
  onRevokePortalLink,
  onUpdateTenant,
}: {
  data: DashboardData;
  tenants: Tenant[];
  onCreatePortalLink: (tenantId: string) => void;
  onRevokePortalLink: (linkId: string) => void;
  onUpdateTenant: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  if (!tenants.length) return <EmptyState label="ยังไม่มีผู้เช่า" />;

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      {tenants.map((tenant) => {
        const unit = data.units.find((item) => item.tenantId === tenant.id);
        const portalLinks = data.portalLinks.filter(
          (link) => link.tenantId === tenant.id && link.active,
        );

        return (
          <Card key={tenant.id} className="rounded-md border border-border shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base font-semibold">
                    {tenant.name}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">
                    {tenant.code} · {tenant.contactName || "ไม่มีชื่อผู้ติดต่อ"}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="rounded-sm text-xs">
                  {tenant.vatEnabled ? "VAT" : "ไม่มี VAT"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="พื้นที่" value={unit?.code ?? "-"} />
                <Info
                  label="ค่าเช่า"
                  value={unit ? formatCurrency(unit.rentAmount) : "-"}
                  className="font-mono text-[var(--font-mono)]"
                />
                <Info label="โทร" value={tenant.phone || "-"} />
                <Info label="อีเมล" value={tenant.email || "-"} />
              </div>
              <Separator />
              <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                {tenant.billingAddress || "ยังไม่มีที่อยู่สำหรับออกบิล"}
              </p>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                <TenantEditButton
                  tenant={tenant}
                  onUpdateTenant={onUpdateTenant}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCreatePortalLink(tenant.id)}
                >
                  <Link2 className="size-4" />
                  สร้างลิงก์
                </Button>
                {portalLinks.map((link) => (
                  <Button
                    key={link.id}
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/20 hover:bg-destructive/10"
                    onClick={() => onRevokePortalLink(link.id)}
                  >
                    ปิดลิงก์
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function TenantEditButton({
  tenant,
  onUpdateTenant,
}: {
  tenant: Tenant;
  onUpdateTenant: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  const handleUpdateInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onUpdateTenant(e);
    if (ok) {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          แก้ไข
        </Button>
      </DialogTrigger>
      <TenantDialog
        tenant={tenant}
        onSubmit={handleUpdateInternal}
        title="แก้ไขผู้เช่า"
      />
    </Dialog>
  );
}

function TenantDialog({
  onSubmit,
  tenant,
  title = "เพิ่มผู้เช่า",
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  tenant?: Tenant;
  title?: string;
}) {
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>ข้อมูลนี้ใช้ผูกพื้นที่และออกเอกสาร</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="tenantId" value={tenant?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="รหัสผู้เช่า"
            name="code"
            placeholder="T-003"
            defaultValue={tenant?.code}
          />
          <Field
            label="ชื่อผู้เช่า"
            name="name"
            defaultValue={tenant?.name}
            required
          />
          <Field
            label="ผู้ติดต่อ"
            name="contactName"
            defaultValue={tenant?.contactName}
          />
          <Field label="โทร" name="phone" defaultValue={tenant?.phone} />
          <Field
            label="อีเมล"
            name="email"
            type="email"
            defaultValue={tenant?.email}
          />
          <Field label="เลขภาษี" name="taxId" defaultValue={tenant?.taxId} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="billingAddress">ที่อยู่สำหรับออกบิล</Label>
          <Textarea
            id="billingAddress"
            name="billingAddress"
            rows={3}
            defaultValue={tenant?.billingAddress}
          />
        </div>
        <div className="grid gap-2">
          <Label>VAT</Label>
          <Select name="vatEnabled" defaultValue={tenant?.vatEnabled === false ? "no" : "yes"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">คิด VAT</SelectItem>
              <SelectItem value="no">ไม่คิด VAT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">บันทึกผู้เช่า</Button>
      </form>
    </DialogContent>
  );
}
