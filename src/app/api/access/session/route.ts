import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getScanSessionRecord, toScanSessionSummary } from "@/lib/access/scan-session-store";
import { readAccessSession } from "@/lib/access/session";

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = readAccessSession(cookieStore);

  if (!session) {
    return NextResponse.json({
      resolved: false,
      session: null
    });
  }

  const scanSession = await getScanSessionRecord(session.scanSessionId);
  if (!scanSession) {
    return NextResponse.json({
      resolved: false,
      session: null
    });
  }

  return NextResponse.json({
    resolved: true,
    session: {
      tier: session.tier,
      tokenPrefix: session.tokenPrefix,
      scanSessionId: session.scanSessionId,
      scanSession: toScanSessionSummary(scanSession)
    }
  });
}
