import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPremiumFinger } from "@/lib/access/scan-flow";
import {
  getScanSessionRecord,
  toScanSessionSummary,
  updateScanSessionRecord
} from "@/lib/access/scan-session-store";
import { readAccessSession } from "@/lib/access/session";
import { persistPremiumCapture } from "@/lib/storage/premium-capture-storage";

export const runtime = "nodejs";

const captureRequestSchema = z.object({
  selectedFinger: z.string()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const accessSession = readAccessSession(cookieStore);

  if (!accessSession) {
    return NextResponse.json(
      { error: "Resolve your access tier before starting a scan." },
      { status: 401 }
    );
  }

  if (accessSession.tier !== "premium") {
    return NextResponse.json(
      { error: "Only Premium sessions can save manual capture images." },
      { status: 403 }
    );
  }

  const scanSession = await getScanSessionRecord(accessSession.scanSessionId);
  if (!scanSession) {
    return NextResponse.json(
      { error: "Your Premium session could not be restored. Resolve access again to continue." },
      { status: 409 }
    );
  }

  if (scanSession.status !== "active") {
    return NextResponse.json(
      {
        error:
          scanSession.status === "completed"
            ? "This Premium session is already complete."
            : "This Premium session is no longer active."
      },
      { status: 409 }
    );
  }

  if (scanSession.completedFingers.length >= scanSession.requiredFingerCount) {
    return NextResponse.json(
      { error: "This Premium session already has all required captures. Finalize it next." },
      { status: 409 }
    );
  }

  const form = await request.formData();
  const parsed = captureRequestSchema.safeParse({
    selectedFinger: form.get("selectedFinger")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
  }

  if (!isPremiumFinger(parsed.data.selectedFinger)) {
    return NextResponse.json({ error: "Unsupported Premium finger." }, { status: 400 });
  }

  const expectedFinger = scanSession.fingerTargets[scanSession.completedFingers.length];
  if (!expectedFinger || expectedFinger !== parsed.data.selectedFinger) {
    return NextResponse.json(
      {
        error: expectedFinger
          ? `Capture ${expectedFinger} next to stay in sequence.`
          : "This Premium session has no remaining fingers to capture."
      },
      { status: 409 }
    );
  }

  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Fingerprint image file is required." }, { status: 400 });
  }

  try {
    const captureOrder = scanSession.completedFingers.length + 1;
    const persisted = await persistPremiumCapture(
      scanSession.id,
      parsed.data.selectedFinger,
      image,
      captureOrder
    );
    const capturedAt = new Date().toISOString();
    const updated = await updateScanSessionRecord(scanSession.id, (record) => ({
      ...record,
      completedFingers: [...record.completedFingers, parsed.data.selectedFinger],
      premiumCaptures: [
        ...record.premiumCaptures,
        {
          finger: parsed.data.selectedFinger,
          processed: true,
          capturedAt,
          fileName: persisted.fileName,
          storageProvider: persisted.storageProvider,
          storageKey: persisted.storageKey,
          storageUrl: persisted.storageUrl,
          storagePath: persisted.storagePath
        }
      ]
    }));

    if (!updated) {
      throw new Error("Unable to persist Premium capture progress.");
    }

    return NextResponse.json({
      ok: true,
      session: toScanSessionSummary(updated)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save Premium capture."
      },
      { status: 500 }
    );
  }
}
