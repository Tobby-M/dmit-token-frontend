import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/access/env";
import type { PremiumCaptureStorageProvider } from "@/lib/access/shared";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

function sanitizeFingerLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function validateImageFile(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WEBP.");
  }

  if (file.size <= 0) {
    throw new Error("Image file is empty.");
  }

  if (file.size > 7_000_000) {
    throw new Error("Image is too large. Please capture again.");
  }
}

export interface PersistedPremiumCapture {
  fileName: string;
  storageProvider: PremiumCaptureStorageProvider;
  storageKey: string | null;
  storageUrl: string | null;
  storagePath: string | null;
}

async function persistToFilesystem(
  sessionId: string,
  selectedFinger: string,
  file: File,
  captureOrder: number
): Promise<PersistedPremiumCapture> {
  const extension = getImageExtension(file.type);
  const directoryPath = path.join(process.cwd(), ".runtime", "premium-captures", sessionId);
  await fs.mkdir(directoryPath, { recursive: true });

  const fileName = `${String(captureOrder).padStart(2, "0")}-${sanitizeFingerLabel(selectedFinger)}.${extension}`;
  const storagePath = path.join(directoryPath, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, bytes);

  return {
    fileName,
    storageProvider: "filesystem",
    storageKey: storagePath,
    storageUrl: null,
    storagePath
  };
}

function buildCloudinarySignature(input: {
  folder: string;
  publicId: string;
  timestamp: string;
  apiSecret: string;
}) {
  const payload = `folder=${input.folder}&public_id=${input.publicId}&timestamp=${input.timestamp}${input.apiSecret}`;
  return createHash("sha1").update(payload).digest("hex");
}

async function persistToCloudinary(
  sessionId: string,
  selectedFinger: string,
  file: File,
  captureOrder: number
): Promise<PersistedPremiumCapture> {
  const {
    cloudinaryApiKey,
    cloudinaryApiSecret,
    cloudinaryCloudName,
    cloudinaryUploadFolder
  } = getServerEnv();

  if (!cloudinaryApiKey || !cloudinaryApiSecret || !cloudinaryCloudName) {
    throw new Error("Cloudinary storage is not fully configured.");
  }

  const extension = getImageExtension(file.type);
  const safeFinger = sanitizeFingerLabel(selectedFinger);
  const baseFileName = `${String(captureOrder).padStart(2, "0")}-${safeFinger}`;
  const folder = `${cloudinaryUploadFolder.replace(/\/+$/, "")}/${sessionId}`;
  const publicId = `${folder}/${baseFileName}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildCloudinarySignature({
    folder,
    publicId,
    timestamp,
    apiSecret: cloudinaryApiSecret
  });

  const formData = new FormData();
  formData.append("file", file, `${baseFileName}.${extension}`);
  formData.append("api_key", cloudinaryApiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("folder", folder);
  formData.append("public_id", publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud upload failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    format?: string;
  };

  return {
    fileName: `${baseFileName}.${payload.format ?? extension}`,
    storageProvider: "cloudinary",
    storageKey: payload.public_id ?? publicId,
    storageUrl: payload.secure_url ?? null,
    storagePath: null
  };
}

export async function persistPremiumCapture(
  sessionId: string,
  selectedFinger: string,
  file: File,
  captureOrder: number
): Promise<PersistedPremiumCapture> {
  validateImageFile(file);

  const { premiumCaptureStorageMode } = getServerEnv();
  return premiumCaptureStorageMode === "cloudinary"
    ? persistToCloudinary(sessionId, selectedFinger, file, captureOrder)
    : persistToFilesystem(sessionId, selectedFinger, file, captureOrder);
}
