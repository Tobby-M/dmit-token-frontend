interface ServerEnv {
  nocodebackendSecretKey: string;
  nocodebackendBaseUrl: string;
  nocodebackendInstance: string;
  accessSessionSecret: string;
  scanSessionStoreMode: "filesystem" | "nocodebackend";
  premiumCaptureStorageMode: "filesystem" | "cloudinary";
  cloudinaryCloudName: string | null;
  cloudinaryApiKey: string | null;
  cloudinaryApiSecret: string | null;
  cloudinaryUploadFolder: string;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getServerEnv(): ServerEnv {
  const nocodebackendSecretKey = process.env.NOCODEBACKEND_SECRET_KEY?.trim();
  const nocodebackendBaseUrl = process.env.NOCODEBACKEND_BASE_URL?.trim();
  const nocodebackendInstance = process.env.NOCODEBACKEND_INSTANCE?.trim();
  const accessSessionSecret =
    process.env.ACCESS_SESSION_SECRET?.trim() ?? nocodebackendSecretKey ?? "";
  const scanSessionStoreMode =
    process.env.SCAN_SESSION_STORE_MODE?.trim() === "nocodebackend"
      ? "nocodebackend"
      : "filesystem";
  const premiumCaptureStorageMode =
    process.env.PREMIUM_CAPTURE_STORAGE_MODE?.trim() === "cloudinary"
      ? "cloudinary"
      : "filesystem";
  const cloudinaryCloudName = readOptionalEnv("CLOUDINARY_CLOUD_NAME");
  const cloudinaryApiKey = readOptionalEnv("CLOUDINARY_API_KEY");
  const cloudinaryApiSecret = readOptionalEnv("CLOUDINARY_API_SECRET");
  const cloudinaryUploadFolder =
    readOptionalEnv("CLOUDINARY_UPLOAD_FOLDER") ?? "dmit-scan-demo/premium-captures";

  if (!nocodebackendSecretKey) {
    throw new Error("NOCODEBACKEND_SECRET_KEY is not configured.");
  }

  if (!nocodebackendBaseUrl) {
    throw new Error("NOCODEBACKEND_BASE_URL is not configured.");
  }

  if (!nocodebackendInstance) {
    throw new Error("NOCODEBACKEND_INSTANCE is not configured.");
  }

  if (!accessSessionSecret) {
    throw new Error("ACCESS_SESSION_SECRET is not configured.");
  }

  if (
    premiumCaptureStorageMode === "cloudinary" &&
    (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret)
  ) {
    throw new Error(
      "Cloudinary storage is enabled but CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET is missing."
    );
  }

  return {
    nocodebackendSecretKey,
    nocodebackendBaseUrl,
    nocodebackendInstance,
    accessSessionSecret,
    scanSessionStoreMode,
    premiumCaptureStorageMode,
    cloudinaryCloudName,
    cloudinaryApiKey,
    cloudinaryApiSecret,
    cloudinaryUploadFolder
  };
}
