import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  FREE_ALLOWED_DEMO_FINGERS
} from "@/lib/access/scan-flow";
import {
  getScanSessionRecord,
  toScanSessionSummary,
  updateScanSessionRecord
} from "@/lib/access/scan-session-store";
import { readAccessSession } from "@/lib/access/session";
import { classifyFingerprint } from "@/lib/dmit/classifier";
import { DemoFinger, isDemoFinger, isTypeCode, TypeCode } from "@/lib/dmit/constants";
import { loadReport, validateDatasetAvailability } from "@/lib/dmit/loader";

const classifyRequestSchema = z.object({
  selectedFinger: z.string()
});

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function logRoute(
  level: "info" | "warn" | "error",
  message: string,
  details?: Record<string, unknown>
): void {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console[level](`[dmit:route] ${message}${payload}`);
}

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

function getFallbackType(): TypeCode {
  const configured = process.env.DMIT_FALLBACK_TYPE?.trim().toUpperCase();
  if (configured && isTypeCode(configured)) {
    return configured;
  }

  // Stable default to keep demo flow unblocked when Gemini output is unavailable.
  return "RL";
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
  requestId: string;
  selectedFinger: DemoFinger;
  tempImagePath: string;
  mimeType: string;
}): Promise<Awaited<ReturnType<typeof classifyFingerprint>>> {
  const model = "gemini-2.5-flash";

  logRoute("info", "Starting classification attempt", {
    requestId: args.requestId,
    selectedFinger: args.selectedFinger,
    mimeType: args.mimeType,
    tempImagePath: args.tempImagePath,
    model,
    attemptLabel: "initial",
    minConfidence: 0.55
  });

  try {
    return await classifyFingerprint({
      requestId: args.requestId,
      attemptLabel: "initial",
      selectedFinger: args.selectedFinger,
      capturedImagePath: args.tempImagePath,
      capturedImageMimeType: args.mimeType,
      model
    });
  } catch (error) {
    logRoute("warn", "Initial classification attempt failed", {
      requestId: args.requestId,
      error: getErrorMessage(error),
      status: getErrorStatus(error),
      retryable: isRetryableClassificationError(error)
    });

    if (!isRetryableClassificationError(error)) {
      throw error;
    }

    logRoute("info", "Retrying classification with lower confidence threshold", {
      requestId: args.requestId,
      selectedFinger: args.selectedFinger,
      mimeType: args.mimeType,
      model,
      attemptLabel: "retry-low-threshold",
      minConfidence: 0.45
    });

    try {
      return await classifyFingerprint({
        requestId: args.requestId,
        attemptLabel: "retry-low-threshold",
        selectedFinger: args.selectedFinger,
        capturedImagePath: args.tempImagePath,
        capturedImageMimeType: args.mimeType,
        model,
        minConfidence: 0.45
      });
    } catch (retryError) {
      logRoute("warn", "Retry with 0.45 threshold failed", {
        requestId: args.requestId,
        error: getErrorMessage(retryError),
        retryable: isRetryableClassificationError(retryError)
      });

      if (!isRetryableClassificationError(retryError)) {
        throw retryError;
      }

      logRoute("info", "Final fallback: Forcing classification with 0 confidence threshold to guarantee output", {
        requestId: args.requestId,
        selectedFinger: args.selectedFinger,
        mimeType: args.mimeType,
        model,
        attemptLabel: "retry-force-zero"
      });

      try {
        return await classifyFingerprint({
          requestId: args.requestId,
          attemptLabel: "retry-force-zero",
          selectedFinger: args.selectedFinger,
          capturedImagePath: args.tempImagePath,
          capturedImageMimeType: args.mimeType,
          model,
          minConfidence: 0.0 // Force it to accept the best guess no matter how low
        });
      } catch (finalError) {
        const fallbackType = getFallbackType();

        logRoute("warn", "All 3 Gemini attempts failed; returning static fallback classification", {
          requestId: args.requestId,
          selectedFinger: args.selectedFinger,
          fallbackType,
          error: getErrorMessage(finalError),
          status: getErrorStatus(finalError)
        });

        return {
          finger: args.selectedFinger,
          type: fallbackType,
          confidence: 0,
          notes: "Fallback classification used after 3 failed Gemini attempts.",
          raw: {
            fallback: true,
            reason: getErrorMessage(finalError),
            attemptLabel: "retry-force-zero",
            model
          }
        };
      }
    }
  }
}

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  let tempImagePath: string | null = null;
  const startedAt = Date.now();

  logRoute("info", "Received classify request", {
    requestId,
    method: request.method,
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent")
  });

  try {
    const cookieStore = await cookies();
    const accessSession = readAccessSession(cookieStore);

    if (!accessSession) {
      logRoute("warn", "Classify request blocked without resolved access session", {
        requestId
      });
      return NextResponse.json(
        {
          error: "Resolve your access tier before starting a scan."
        },
        { status: 401 }
      );
    }

    const scanSession = await getScanSessionRecord(accessSession.scanSessionId);
    if (!scanSession) {
      logRoute("warn", "Access session missing scan session record", {
        requestId,
        scanSessionId: accessSession.scanSessionId
      });
      return NextResponse.json(
        {
          error: "Your scan session could not be restored. Resolve access again to continue."
        },
        { status: 409 }
      );
    }

    if (scanSession.status !== "active") {
      logRoute("warn", "Classify request blocked for inactive scan session", {
        requestId,
        scanSessionId: scanSession.id,
        status: scanSession.status
      });
      return NextResponse.json(
        {
          error:
            scanSession.status === "completed"
              ? "This scan session is already complete. Change access to start a new one."
              : "This scan session is no longer active. Resolve access again to continue."
        },
        { status: 409 }
      );
    }

    if (accessSession.tier === "premium") {
      logRoute("warn", "Premium session attempted AI classification", {
        requestId
      });
      return NextResponse.json(
        {
          error: "Premium scans do not use the live AI classification flow.",
          details: "Premium processing is handled manually after the full 10-finger capture."
        },
        { status: 403 }
      );
    }

    if (scanSession.completedFingers.length >= scanSession.requiredFingerCount) {
      logRoute("warn", "Classify request blocked after required scan count reached", {
        requestId,
        scanSessionId: scanSession.id,
        completedFingers: scanSession.completedFingers
      });
      return NextResponse.json(
        {
          error: "This scan session already has all required captures. Finalize it or change access."
        },
        { status: 409 }
      );
    }

    await validateDatasetAvailability();
    logRoute("info", "Dataset availability check passed", { requestId });

    const form = await request.formData();
    const parsed = classifyRequestSchema.parse({
      selectedFinger: form.get("selectedFinger")
    });

    const image = form.get("image");
    if (!(image instanceof File)) {
      logRoute("warn", "Request missing fingerprint image", { requestId });
      return NextResponse.json({ error: "Fingerprint image file is required." }, { status: 400 });
    }

    logRoute("info", "Parsed classify form data", {
      requestId,
      selectedFinger: parsed.selectedFinger,
      imageName: image.name,
      imageType: image.type,
      imageSize: image.size
    });

    if (!isDemoFinger(parsed.selectedFinger)) {
      logRoute("warn", "Unsupported finger submitted", {
        requestId,
        selectedFinger: parsed.selectedFinger
      });
      return NextResponse.json(
        { error: "Unsupported finger for demo." },
        { status: 400 }
      );
    }

    if (accessSession.tier === "free") {
      if (!FREE_ALLOWED_DEMO_FINGERS.includes(parsed.selectedFinger)) {
        return NextResponse.json(
          { error: "Free Trial only supports the Thumb or Index options." },
          { status: 400 }
        );
      }

      const lockedFinger = scanSession.fingerTargets[0];
      if (lockedFinger && lockedFinger !== parsed.selectedFinger) {
        return NextResponse.json(
          { error: `This Free Trial session is locked to ${lockedFinger}.` },
          { status: 409 }
        );
      }
    } else {
      const expectedFinger = scanSession.fingerTargets[scanSession.completedFingers.length];
      if (!expectedFinger || expectedFinger !== parsed.selectedFinger) {
        return NextResponse.json(
          {
            error: expectedFinger
              ? `Capture ${expectedFinger} next to stay in the Basic sequence.`
              : "This scan session has no remaining Basic fingers to analyze."
          },
          { status: 409 }
        );
      }
    }

    const persisted = await persistUploadedImageTemp(image);
    tempImagePath = persisted.filePath;

    logRoute("info", "Persisted uploaded fingerprint to temp file", {
      requestId,
      tempImagePath: persisted.filePath,
      mimeType: persisted.mimeType
    });

    let classification;
    try {
      classification = await classifyWithRetry({
        requestId,
        selectedFinger: parsed.selectedFinger,
        mimeType: persisted.mimeType,
        tempImagePath: persisted.filePath
      });
    } catch (error) {
      logRoute("error", "Classification failed", {
        requestId,
        error: getErrorMessage(error),
        status: getErrorStatus(error)
      });
      return getClassifierErrorResponse(error);
    }

    logRoute("info", "Classification returned from Gemini", {
      requestId,
      classification
    });

    if (classification.finger !== parsed.selectedFinger) {
      logRoute("warn", "Finger mismatch after classification", {
        requestId,
        selectedFinger: parsed.selectedFinger,
        classifiedFinger: classification.finger,
        type: classification.type,
        confidence: classification.confidence
      });
      return NextResponse.json(
        {
          error: "Finger mismatch detected. Please recapture the selected finger.",
          recaptureRequired: true
        },
        { status: 422 }
      );
    }

    const report = await loadReport(classification.finger, classification.type);
    const updatedSession = await updateScanSessionRecord(accessSession.scanSessionId, (record) => ({
      ...record,
      fingerTargets:
        record.tier === "free" && record.fingerTargets.length === 0
          ? [classification.finger]
          : record.fingerTargets,
      completedFingers: [...record.completedFingers, classification.finger],
      basicResults:
        record.tier === "basic"
          ? [
              ...record.basicResults,
              {
                finger: classification.finger,
                type: classification.type,
                confidence: classification.confidence,
                notes: classification.notes,
                abilityTitle: report.abilityTitle
              }
            ]
          : record.basicResults
    }));

    if (!updatedSession) {
      throw new Error("Unable to persist scan session progress.");
    }

    logRoute("info", "Loaded report for classification", {
      requestId,
      finger: classification.finger,
      type: classification.type,
      elapsedMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      classification,
      report,
      session: toScanSessionSummary(updatedSession)
    });
  } catch (error) {
    logRoute("error", "Unhandled classify route failure", {
      requestId,
      error: getErrorMessage(error),
      status: getErrorStatus(error),
      elapsedMs: Date.now() - startedAt
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error"
      },
      { status: 500 }
    );
  } finally {
    if (tempImagePath) {
      await fs.unlink(tempImagePath)
        .then(() => {
          logRoute("info", "Deleted temp fingerprint file", {
            requestId,
            tempImagePath
          });
        })
        .catch((error) => {
          logRoute("warn", "Failed to delete temp fingerprint file", {
            requestId,
            tempImagePath,
            error: getErrorMessage(error)
          });
        });
    }

    logRoute("info", "Classify request finished", {
      requestId,
      elapsedMs: Date.now() - startedAt
    });
  }
}
