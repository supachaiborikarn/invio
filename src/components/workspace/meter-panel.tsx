"use client";

import { useState, useMemo, type FormEvent } from "react";
import { ImageUp, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { DashboardData, MeterReading } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/billing";
import {
  EmptyState,
  Info,
  Field,
  getUnit,
  getTenant,
  createId,
} from "./utils";

type UploadResult = {
  url: string;
  publicId?: string;
  assetId?: string;
  version?: number;
  width?: number;
  height?: number;
};

export function MeterPanel({
  data,
  cycleId,
  onMeterSubmit,
  onUpdateMeterReading,
  onDeleteMeterReading,
}: {
  data: DashboardData;
  cycleId: string;
  onMeterSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onUpdateMeterReading: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onDeleteMeterReading: (readingId: string) => Promise<boolean>;
}) {
  const [meterOpen, setMeterOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [previousUploadResult, setPreviousUploadResult] = useState<UploadResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [previousUploadMessage, setPreviousUploadMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviousUploading, setIsPreviousUploading] = useState(false);

  async function uploadMeterImage(file: File): Promise<UploadResult> {
    if (!data.cloudinaryConfigured) {
      if (data.databaseConfigured) {
        throw new Error("ยังไม่ได้ตั้งค่า Cloudinary จึงเก็บรูปมิเตอร์จริงไม่ได้");
      }
      return {
        url: URL.createObjectURL(file),
      };
    }

    const signResponse = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!signResponse.ok) {
      const response = (await signResponse.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(response?.message ?? "อัปโหลดรูปไม่ได้");
    }

    const signed = (await signResponse.json()) as {
      cloudName: string;
      apiKey: string;
      signature: string;
      params: Record<string, string | number | boolean>;
    };

    const uploadForm = new FormData();
    uploadForm.set("file", file);
    uploadForm.set("api_key", signed.apiKey);
    uploadForm.set("signature", signed.signature);

    for (const [key, value] of Object.entries(signed.params)) {
      uploadForm.set(key, String(value));
    }

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      {
        method: "POST",
        body: uploadForm,
      },
    );

    if (!uploadResponse.ok) {
      throw new Error("Cloudinary ปฏิเสธไฟล์นี้");
    }

    const result = (await uploadResponse.json()) as {
      secure_url: string;
      public_id: string;
      asset_id: string;
      version: number;
      width: number;
      height: number;
    };

    return {
      url: result.secure_url,
      publicId: result.public_id,
      assetId: result.asset_id,
      version: result.version,
      width: result.width,
      height: result.height,
    };
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    setIsUploading(true);
    setUploadMessage("");
    try {
      const result = await uploadMeterImage(file);
      setUploadResult(result);
      setUploadMessage(
        data.cloudinaryConfigured
          ? "อัปโหลดรูปเข้า Cloudinary แล้ว"
          : "แสดงรูปตัวอย่างในโหมด demo",
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePreviousUpload(file?: File) {
    if (!file) return;
    setIsPreviousUploading(true);
    setPreviousUploadMessage("");
    try {
      const result = await uploadMeterImage(file);
      setPreviousUploadResult(result);
      setPreviousUploadMessage(
        data.cloudinaryConfigured
          ? "อัปโหลดรูปเดือนก่อนเข้า Cloudinary แล้ว"
          : "แสดงรูปเดือนก่อนในโหมด demo",
      );
    } catch (error) {
      setPreviousUploadMessage(
        error instanceof Error ? error.message : "อัปโหลดรูปเดือนก่อนไม่สำเร็จ",
      );
    } finally {
      setIsPreviousUploading(false);
    }
  }

  function resetMeterUploads() {
    setUploadResult(null);
    setPreviousUploadResult(null);
    setUploadMessage("");
    setPreviousUploadMessage("");
  }

  const handleMeterSubmitInternal = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onMeterSubmit(e);
    if (ok) {
      resetMeterUploads();
      setMeterOpen(false);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-muted-foreground">เลขและรูปถ่ายมิเตอร์ค่าไฟ</h3>
        <Dialog open={meterOpen} onOpenChange={setMeterOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={!cycleId} onClick={() => setMeterOpen(true)}>
              <ImageUp className="size-4" />
              บันทึกมิเตอร์
            </Button>
          </DialogTrigger>
          {cycleId ? (
            <MeterDialog
              data={data}
              activeCycleId={cycleId}
              isUploading={isUploading}
              isPreviousUploading={isPreviousUploading}
              uploadMessage={uploadMessage}
              previousUploadMessage={previousUploadMessage}
              uploadResult={uploadResult}
              previousUploadResult={previousUploadResult}
              onFileChange={handleUpload}
              onPreviousFileChange={handlePreviousUpload}
              onResetUploads={resetMeterUploads}
              onSubmit={handleMeterSubmitInternal}
            />
          ) : null}
        </Dialog>
      </div>

      <MeterList
        data={data}
        cycleId={cycleId}
        onUpdateReading={onUpdateMeterReading}
        onDeleteReading={onDeleteMeterReading}
        cloudinaryConfigured={data.cloudinaryConfigured}
        databaseConfigured={data.databaseConfigured}
        uploadMeterImage={uploadMeterImage}
      />
    </section>
  );
}

export function meterReadingImageSrc(reading?: MeterReading) {
  if (!reading) return "";
  const hasImg = Boolean(
    reading.cloudinaryPublicId?.trim() ||
      reading.imageUrl?.trim()
  );
  if (!hasImg) return "";

  return reading.cloudinaryPublicId?.startsWith("demo/")
    ? reading.imageUrl
    : `/api/meter-images/${reading.id}`;
}

export function MeterList({
  data,
  cycleId,
  compact,
  onUpdateReading,
  onDeleteReading,
  cloudinaryConfigured = false,
  databaseConfigured = false,
  uploadMeterImage,
}: {
  data: DashboardData;
  cycleId?: string;
  compact?: boolean;
  onUpdateReading?: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onDeleteReading?: (readingId: string) => Promise<boolean>;
  cloudinaryConfigured?: boolean;
  databaseConfigured?: boolean;
  uploadMeterImage?: (file: File) => Promise<UploadResult>;
}) {
  const readings = useMemo(() => {
    const sourceReadings = cycleId
      ? data.meterReadings.filter((reading) => reading.cycleId === cycleId)
      : data.meterReadings;
    return compact ? sourceReadings.slice(0, 3) : sourceReadings;
  }, [data.meterReadings, cycleId, compact]);

  if (!readings.length) return <EmptyState label="ยังไม่มีเลขมิเตอร์" />;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {readings.map((reading) => {
        const unit = getUnit(data, reading.unitId);
        const tenant = getTenant(data, reading.tenantId);
        const imageSrc = meterReadingImageSrc(reading);

        return (
          <Card key={reading.id} className="overflow-hidden rounded-md border border-border shadow-xs">
            <div className="aspect-[16/10] bg-muted relative">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={`รูปมิเตอร์ ${unit?.code ?? ""}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Upload className="size-7" />
                  <span>ยังไม่มีรูปมิเตอร์</span>
                </div>
              )}
            </div>
            <CardContent className="flex flex-col gap-3 p-4 min-w-0">
              <div className="flex items-start justify-between gap-3 min-w-0 w-full">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-sm" title={`${unit?.code ?? "-"} · ${tenant?.name ?? "-"}`}>
                    {unit?.code ?? "-"} · {tenant?.name ?? "-"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(reading.capturedAt)}
                  </p>
                </div>
                <div className="shrink-0">
                  {reading.warning ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="rounded-sm bg-[var(--tone-danger-soft)] text-[var(--tone-danger)] text-xs">
                          ตรวจสอบ
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{reading.warning}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge className="rounded-sm bg-[var(--tone-ok-soft)] text-[var(--tone-ok)] text-xs">
                      ปกติ
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm pt-1 min-w-0">
                <Info label="ก่อน" value={formatNumber(reading.previousReading)} className="font-mono text-[var(--font-mono)]" />
                <Info label="หลัง" value={formatNumber(reading.currentReading)} className="font-mono text-[var(--font-mono)]" />
                <Info label="ใช้" value={`${formatNumber(reading.usageUnits)} หน่วย`} className="font-mono text-[var(--font-mono)]" />
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm min-w-0 w-full">
                <span className="text-muted-foreground shrink-0">
                  {formatCurrency(reading.rate)} / หน่วย
                </span>
                <span className="font-bold font-mono text-base text-foreground truncate pl-2" title={formatCurrency(reading.amount)}>
                  {formatCurrency(reading.amount)}
                </span>
              </div>
              {onUpdateReading && onDeleteReading && uploadMeterImage && (
                <div className="border-t border-border/50 pt-3 flex justify-end">
                  <MeterEditButton
                    data={data}
                    reading={reading}
                    onUpdateReading={onUpdateReading}
                    onDeleteReading={onDeleteReading}
                    cloudinaryConfigured={cloudinaryConfigured}
                    databaseConfigured={databaseConfigured}
                    uploadMeterImage={uploadMeterImage}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MeterEditButton({
  data,
  reading,
  onUpdateReading,
  onDeleteReading,
  cloudinaryConfigured,
  databaseConfigured,
  uploadMeterImage,
}: {
  data: DashboardData;
  reading: MeterReading;
  onUpdateReading: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  onDeleteReading: (readingId: string) => Promise<boolean>;
  cloudinaryConfigured: boolean;
  databaseConfigured: boolean;
  uploadMeterImage: (file: File) => Promise<UploadResult>;
}) {
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(file?: File) {
    if (!file) return;
    setIsUploading(true);
    setUploadMessage("");
    try {
      const result = await uploadMeterImage(file);
      setUploadResult(result);
      setUploadMessage(
        cloudinaryConfigured
          ? "อัปโหลดรูปเข้า Cloudinary แล้ว"
          : "แสดงรูปตัวอย่างในโหมด demo"
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "อัปโหลดรูปไม่สำเร็จ"
      );
    } finally {
      setIsUploading(false);
    }
  }

  const handleUpdate = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onUpdateReading(e);
    if (ok) {
      setOpen(false);
    }
  };

  const handleDelete = async () => {
    const ok = await onDeleteReading(reading.id);
    if (ok) {
      setDeleteConfirmOpen(false);
      setOpen(false);
    }
  };

  const unit = getUnit(data, reading.unitId);
  const tenant = getTenant(data, reading.tenantId);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            แก้ไขเลข
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>แก้ไขเลขมิเตอร์ไฟ</DialogTitle>
            <DialogDescription>
              แก้ไขหน่วยและเรทค่าไฟย้อนหลัง ระบบจะปรับยอดเงินในบิลที่เกี่ยวข้อง (ฉบับร่าง/รอชำระเงิน) ให้อัตโนมัติ
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="grid gap-4">
            <input type="hidden" name="meterReadingId" value={reading.id} />
            <input type="hidden" name="cloudinaryPublicId" value={uploadResult?.publicId ?? reading.cloudinaryPublicId ?? ""} />
            <input type="hidden" name="cloudinaryAssetId" value={uploadResult?.assetId ?? reading.cloudinaryAssetId ?? ""} />
            <input type="hidden" name="cloudinarySecureUrl" value={uploadResult?.url ?? reading.imageUrl ?? ""} />
            <input type="hidden" name="cloudinaryVersion" value={uploadResult?.version ?? ""} />
            <input type="hidden" name="imageWidth" value={uploadResult?.width ?? ""} />
            <input type="hidden" name="imageHeight" value={uploadResult?.height ?? ""} />

            <div className="grid gap-2">
              <Label>พื้นที่และผู้เช่า</Label>
              <div className="text-sm font-semibold p-3 bg-muted rounded-md">
                {unit?.code} · {tenant?.name ?? "ไม่มีผู้เช่า"}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="เรทต่อหน่วย"
                name="rate"
                type="number"
                step="0.01"
                defaultValue={String(reading.rate)}
              />
              <Field
                label="เลขเดือนก่อน"
                name="previousReading"
                type="number"
                defaultValue={String(reading.previousReading)}
              />
              <Field
                label="เลขเดือนนี้"
                name="currentReading"
                type="number"
                defaultValue={String(reading.currentReading)}
              />
            </div>

            <div className="rounded-md border border-dashed border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">รูปถ่ายประกอบมิเตอร์</span>
              </div>
              <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-sm bg-muted max-w-sm mx-auto">
                <img
                  src={uploadResult?.url || meterReadingImageSrc(reading)}
                  alt="รูปมิเตอร์"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-3 grid gap-2 max-w-sm mx-auto w-full">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
                <p className="text-xs text-muted-foreground">
                  {isUploading ? "กำลังอัปโหลด..." : uploadMessage || "เปลี่ยนรูปถ่ายถ้าต้องการ (รองรับ JPG, PNG)"}
                </p>
              </div>
            </div>

            <div className="flex justify-between gap-2 border-t border-border pt-4 mt-2">
              <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                ลบรายการมิเตอร์
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button type="submit">บันทึกการแก้ไข</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive font-bold">ยืนยันการลบเลขมิเตอร์</DialogTitle>
            <DialogDescription className="leading-relaxed">
              การดำเนินการนี้จะลบการบันทึกเลขมิเตอร์ และ **ยกเลิก/ลบใบแจ้งหนี้ค่าไฟ** ที่เกี่ยวข้องโดยอัตโนมัติ (เฉพาะบิลที่ยังไม่ได้จ่ายเงิน) คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3 border-t border-border/50 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}>ยกเลิก</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>ยืนยันลบ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MeterDialog({
  data,
  activeCycleId,
  isUploading,
  isPreviousUploading,
  uploadMessage,
  previousUploadMessage,
  uploadResult,
  previousUploadResult,
  onFileChange,
  onPreviousFileChange,
  onResetUploads,
  onSubmit,
}: {
  data: DashboardData;
  activeCycleId: string;
  isUploading: boolean;
  isPreviousUploading: boolean;
  uploadMessage: string;
  previousUploadMessage: string;
  uploadResult: UploadResult | null;
  previousUploadResult: UploadResult | null;
  onFileChange: (file?: File) => void;
  onPreviousFileChange: (file?: File) => void;
  onResetUploads: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? "");
  const unit = getUnit(data, unitId);
  const lastReading = [...data.meterReadings]
    .filter(
      (reading) =>
        reading.unitId === unitId && reading.cycleId !== activeCycleId,
    )
    .sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    )[0];
    
  const hasMeterImage = (reading: MeterReading) => {
    return Boolean(
      reading.cloudinaryPublicId?.trim() ||
        reading.imageUrl?.trim()
    );
  };

  const previousImageReading = [...data.meterReadings]
    .filter(
      (reading) =>
        reading.unitId === unitId &&
        reading.cycleId !== activeCycleId &&
        hasMeterImage(reading),
    )
    .sort((a, b) => {
      const actualReadingScore =
        Number(b.usageUnits > 0) - Number(a.usageUnits > 0);

      return (
        actualReadingScore ||
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
      );
    })[0];
  const previousImageSrc = meterReadingImageSrc(previousImageReading);
  const previousDisplayReading = previousImageReading ?? lastReading;
  const selectedPreviousImageSrc = previousUploadResult?.url ?? previousImageSrc;
  const selectedPreviousImageLabel = previousUploadResult
    ? "รูปที่เพิ่งเลือก"
    : previousDisplayReading
      ? formatDate(previousDisplayReading.capturedAt)
      : "ยังไม่มีข้อมูล";

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>บันทึกมิเตอร์ไฟ</DialogTitle>
        <DialogDescription>
          อัปโหลดรูปเดือนนี้ ระบบจะดึงรูปเดือนก่อนจากเลขล่าสุดของพื้นที่เดียวกัน
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="cycleId" value={activeCycleId} />
        <input type="hidden" name="billingCycleId" value={activeCycleId} />
        <input type="hidden" name="tenantId" value={unit?.tenantId ?? ""} />
        <input
          type="hidden"
          name="cloudinaryPublicId"
          value={uploadResult?.publicId ?? ""}
        />
        <input
          type="hidden"
          name="cloudinaryAssetId"
          value={uploadResult?.assetId ?? ""}
        />
        <input
          type="hidden"
          name="cloudinarySecureUrl"
          value={uploadResult?.url ?? ""}
        />
        <input
          type="hidden"
          name="cloudinaryVersion"
          value={uploadResult?.version ?? ""}
        />
        <input
          type="hidden"
          name="imageWidth"
          value={uploadResult?.width ?? ""}
        />
        <input
          type="hidden"
          name="imageHeight"
          value={uploadResult?.height ?? ""}
        />
        <input
          type="hidden"
          name="previousCloudinaryPublicId"
          value={previousUploadResult?.publicId ?? ""}
        />
        <input
          type="hidden"
          name="previousCloudinaryAssetId"
          value={previousUploadResult?.assetId ?? ""}
        />
        <input
          type="hidden"
          name="previousCloudinarySecureUrl"
          value={previousUploadResult?.url ?? ""}
        />
        <input
          type="hidden"
          name="previousCloudinaryVersion"
          value={previousUploadResult?.version ?? ""}
        />
        <input
          type="hidden"
          name="previousImageWidth"
          value={previousUploadResult?.width ?? ""}
        />
        <input
          type="hidden"
          name="previousImageHeight"
          value={previousUploadResult?.height ?? ""}
        />
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>พื้นที่</Label>
            <Select
              name="unitId"
              value={unitId}
              onValueChange={(value) => {
                setUnitId(value);
                onResetUploads();
              }}
            >
              <SelectTrigger className="w-full min-w-0 [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                <SelectValue placeholder="เลือกพื้นที่" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)]">
                {data.units.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="block max-w-[32rem] truncate">
                      {item.code} · {getTenant(data, item.tenantId)?.name ?? "-"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              key={`${unit?.id ?? "unit"}-rate`}
              label="เรทต่อหน่วย"
              name="rate"
              type="number"
              step="0.01"
              defaultValue={String(unit?.electricRate ?? 0)}
            />
            <Field
              key={`${unit?.id ?? "unit"}-previous`}
              label="เลขเดือนก่อน"
              name="previousReading"
              type="number"
              defaultValue={String(lastReading?.currentReading ?? 0)}
            />
            <Field label="เลขเดือนนี้" name="currentReading" type="number" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="meterImage">รูปมิเตอร์ประกอบใบแจ้งหนี้</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">รูปเดือนก่อน</span>
                <span className="text-xs text-muted-foreground text-ellipsis overflow-hidden">
                  {selectedPreviousImageLabel}
                </span>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted">
                {selectedPreviousImageSrc ? (
                  <img
                    src={selectedPreviousImageSrc}
                    alt="รูปมิเตอร์เดือนก่อน"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid place-items-center gap-2 px-3 text-center text-xs text-muted-foreground">
                    <Upload className="size-7" />
                    <span>ยังไม่มีรูปเดือนก่อน</span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                เลขล่าสุด{" "}
                {previousDisplayReading
                  ? formatNumber(previousDisplayReading.currentReading)
                  : "-"}
              </p>
              <div className="mt-3 grid gap-2">
                <Input
                  id="previousMeterImage"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) =>
                    onPreviousFileChange(event.target.files?.[0])
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {isPreviousUploading
                    ? "กำลังอัปโหลด..."
                    : previousUploadMessage ||
                      "ใส่ได้ถ้ายังไม่มีรูปในระบบ"}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-dashed border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">รูปเดือนปัจจุบัน</span>
                <span className="text-xs text-muted-foreground">
                  ต้องอัปโหลดก่อนบันทึก
                </span>
              </div>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted">
                {uploadResult ? (
                  <img
                    src={uploadResult.url}
                    alt="ตัวอย่างรูปมิเตอร์เดือนปัจจุบัน"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Upload className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="mt-3 grid gap-2">
                <Input
                  id="meterImage"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => onFileChange(event.target.files?.[0])}
                />
                <p className="text-xs text-muted-foreground">
                  {isUploading
                    ? "กำลังอัปโหลด..."
                    : uploadMessage || "รองรับ JPG, PNG"}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            เวลาพิมพ์ใบแจ้งหนี้ ระบบจะแสดงรูปเดือนก่อนและรูปเดือนปัจจุบันคู่กัน
          </p>
        </div>
        <div className="grid gap-2">
          <Label>ออกใบแจ้งหนี้ค่าไฟ</Label>
          <Select name="createInvoice" defaultValue="yes">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">ออกใบแจ้งหนี้ทันที</SelectItem>
              <SelectItem value="no">บันทึกเลขอย่างเดียว</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isUploading || isPreviousUploading} className="w-full">
          บันทึกมิเตอร์
        </Button>
      </form>
    </DialogContent>
  );
}
