import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_SESSION_COOKIE } from "@/lib/access/session";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
