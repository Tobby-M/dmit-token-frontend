import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { abandonScanSessionRecord } from "@/lib/access/scan-session-store";
import { ACCESS_SESSION_COOKIE, readAccessSession } from "@/lib/access/session";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const session = readAccessSession(cookieStore);

  if (session?.scanSessionId) {
    await abandonScanSessionRecord(session.scanSessionId);
  }

  cookieStore.delete(ACCESS_SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
