import { v2 as cloudinary } from "cloudinary";

let configured = false;

export function getCloudinaryConfig() {
  return {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER ?? "meter-readings",
  };
}

export function getCloudinary() {
  const config = getCloudinaryConfig();

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error("Cloudinary is not configured");
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export function createUploadSignature(input?: { publicId?: string }) {
  const config = getCloudinaryConfig();
  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number | boolean> = {
    timestamp,
    folder: config.folder,
    type: "authenticated",
    overwrite: false,
  };

  if (input?.publicId) {
    params.public_id = input.publicId;
  }

  const signature = getCloudinary().utils.api_sign_request(
    params,
    config.apiSecret,
  );

  return {
    params,
    signature,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
  };
}

export function createSignedImageUrl(publicId: string, version?: number) {
  return getCloudinary().url(publicId, {
    secure: true,
    type: "authenticated",
    sign_url: true,
    version,
  });
}
