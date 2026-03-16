import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { classifyFingerprint } from "@/lib/dmit/classifier";
import { DemoFinger, isDemoFinger } from "@/lib/dmit/constants";
import { loadReport, validateDatasetAvailability } from "@/lib/dmit/loader";

const classifyRequestSchema = z.object({
  selectedFinger: z.string()
});

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRetryableClassificationError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.startsWith("Low confidence classification") ||
    message === "Model did not return a function call." ||
    message.startsWith("Invalid finger from model:") ||
    message.startsWith("Invalid type from model:")
  );
}

function isLowConfidenceError(error: unknown): boolean {
  return getErrorMessage(error).startsWith("Low confidence classification");
}

function getClassifierErrorResponse(error: unknown): NextResponse {
  const message = getErrorMessage(error);
  const status = getErrorStatus(error);

  if (isLowConfidenceError(error)) {
    return NextResponse.json(
      {
        error: "Could not classify confidently.",
        recaptureRequired: true,
        details: message
      },
      { status: 422 }
    );
  }

  if (message === "GEMINI_API_KEY is not configured.") {
    return NextResponse.json(
      {
        error: "Gemini API key is not configured.",
        details: "Set GEMINI_API_KEY in your environment before analyzing a scan."
      },
      { status: 500 }
    );
  }

  if (status === 401 || status === 403 || /PERMISSION_DENIED|API key/i.test(message)) {
    return NextResponse.json(
      {
        error: "Gemini API request was rejected.",
        details: "The configured GEMINI_API_KEY is invalid or has been revoked. Rotate it and restart the app."
      },
      { status: 502 }
    );
  }

  if (/model/i.test(message) && /not found|unsupported|unknown|unavailable/i.test(message)) {
    return NextResponse.json(
      {
        error: "Gemini model is unavailable.",
        details: "Use a supported multimodal model such as gemini-2.5-flash."
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      error: "Classification service failed.",
      details: message
    },
    { status: 502 }
  );
}

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

async function persistUploadedImageTemp(file: File): Promise<{ filePath: string; mimeType: string }> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use JPEG, PNG, or WEBP.");
  }

  if (file.size <= 0) {
    throw new Error("Image file is empty.");
  }

  if (file.size > 7_000_000) {
    throw new Error("Image is too large. Please capture again.");
  }

  const extension = getImageExtension(file.type);
  const fileName = `dmit-capture-${randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  return {
    filePath,
    mimeType: file.type
  };
}

async function classifyWithRetry(args: {
  selectedFinger: DemoFinger;
  tempImagePath: string;
  mimeType: string;
}): Promise<Awaited<ReturnType<typeof classifyFingerprint>>> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  try {
    return await classifyFingerprint({
      selectedFinger: args.selectedFinger,
      capturedImagePath: args.tempImagePath,
      capturedImageMimeType: args.mimeType,
      model
    });
  } catch (error) {
    if (!isRetryableClassificationError(error)) {
      throw error;
    }

    return await classifyFingerprint({
      selectedFinger: args.selectedFinger,
      capturedImagePath: args.tempImagePath,
      capturedImageMimeType: args.mimeType,
      model,
      minConfidence: 0.45
    });
  }
}

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let tempImagePath: string | null = null;

  try {
    await validateDatasetAvailability();

    const form = await request.formData();
    const parsed = classifyRequestSchema.parse({
      selectedFinger: form.get("selectedFinger")
    });

    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Fingerprint image file is required." }, { status: 400 });
    }

    if (!isDemoFinger(parsed.selectedFinger)) {
      return NextResponse.json(
        { error: "Unsupported finger for demo." },
        { status: 400 }
      );
    }

    const persisted = await persistUploadedImageTemp(image);
    tempImagePath = persisted.filePath;

    let classification;
    try {
      classification = await classifyWithRetry({
        selectedFinger: parsed.selectedFinger,
        mimeType: persisted.mimeType,
        tempImagePath: persisted.filePath
      });
    } catch (error) {
      return getClassifierErrorResponse(error);
    }

    if (classification.finger !== parsed.selectedFinger) {
      return NextResponse.json(
        {
          error: "Finger mismatch detected. Please recapture the selected finger.",
          recaptureRequired: true
        },
        { status: 422 }
      );
    }

    const report = await loadReport(classification.finger, classification.type);

    return NextResponse.json({
      ok: true,
      classification,
      report
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error"
      },
      { status: 500 }
    );
  } finally {
    if (tempImagePath) {
      await fs.unlink(tempImagePath).catch(() => undefined);
    }
  }
}
