import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { consumeTokenRecord } from "@/lib/access/nocodebackend";
import {
  getScanSessionRecord,
  toScanSessionSummary,
  updateScanSessionRecord
} from "@/lib/access/scan-session-store";
import { readAccessSession } from "@/lib/access/session";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  return typeof (error as { status?: unknown }).status === "number"
    ? ((error as { status?: number }).status ?? null)
    : null;
}

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const accessSession = readAccessSession(cookieStore);

  if (!accessSession) {
    return NextResponse.json(
      { error: "Resolve your access tier before finalizing a scan." },
      { status: 401 }
    );
  }

  const scanSession = await getScanSessionRecord(accessSession.scanSessionId);
  if (!scanSession) {
    return NextResponse.json(
      { error: "Your scan session could not be restored. Resolve access again to continue." },
      { status: 409 }
    );
  }

  if (scanSession.status === "completed") {
    return NextResponse.json({
      ok: true,
      session: toScanSessionSummary(scanSession)
    });
  }

  if (scanSession.status !== "active") {
    return NextResponse.json(
      { error: "This scan session is no longer active." },
      { status: 409 }
    );
  }

  if (scanSession.completedFingers.length < scanSession.requiredFingerCount) {
    return NextResponse.json(
      {
        error: `Complete all ${scanSession.requiredFingerCount} required fingers before finalizing this session.`
      },
      { status: 409 }
    );
  }

  let redemption = scanSession.redemption;

  if (scanSession.tokenRecordId !== null && !scanSession.redemption.consumed) {
    try {
      const tokenConsumption = await consumeTokenRecord(scanSession.tokenRecordId);
      redemption = {
        consumed: true,
        consumedAt: new Date().toISOString(),
        beforeRemainingUses: tokenConsumption.beforeRemainingUses,
        afterRemainingUses: tokenConsumption.afterRemainingUses,
        resultingStatus: tokenConsumption.resultingStatus
      };
    } catch (error) {
      return NextResponse.json(
        {
          error: getErrorMessage(error)
        },
        { status: getErrorStatus(error) ?? 500 }
      );
    }
  }

  const updated = await updateScanSessionRecord(scanSession.id, (record) => ({
    ...record,
    status: "completed",
    completedAt: new Date().toISOString(),
    redemption
  }));

  if (!updated) {
    return NextResponse.json(
      { error: "Unable to finalize the scan session." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    session: toScanSessionSummary(updated)
  });
}
