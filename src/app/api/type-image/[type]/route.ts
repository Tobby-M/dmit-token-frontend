import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { isTypeCode } from "@/lib/dmit/constants";
import { getTypeImagePath } from "@/lib/dmit/loader";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  const params = await context.params;
  const type = params.type.toUpperCase();

  if (!isTypeCode(type)) {
    return NextResponse.json({ error: "Unknown type image." }, { status: 404 });
  }

  const bytes = await fs.readFile(getTypeImagePath(type));

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}