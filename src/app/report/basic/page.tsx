import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { BasicReportBundleView } from "@/components/report/BasicReportBundleView";
import { readAccessSession } from "@/lib/access/session";
import { getScanSessionRecord } from "@/lib/access/scan-session-store";
import { isDemoFinger, isTypeCode, type DemoFinger, type TypeCode } from "@/lib/dmit/constants";
import { loadReport } from "@/lib/dmit/loader";

export const dynamic = "force-dynamic";

interface BasicReportPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BasicReportPage(props: BasicReportPageProps) {
  const searchParams = await props.searchParams;
  const sessionParam = searchParams.sessionId;
  const requestedSessionId = typeof sessionParam === "string" ? sessionParam : null;
  const cookieStore = await cookies();
  const accessSession = readAccessSession(cookieStore);
  const scanSessionId = requestedSessionId ?? accessSession?.scanSessionId ?? null;

  if (!scanSessionId) {
    return notFound();
  }

  const scanSession = await getScanSessionRecord(scanSessionId);
  if (!scanSession || scanSession.tier !== "basic" || scanSession.status !== "completed") {
    return notFound();
  }

  if (scanSession.basicResults.length !== scanSession.requiredFingerCount) {
    return notFound();
  }

  const items = await Promise.all(
    scanSession.basicResults.map(async (result) => {
      if (!isDemoFinger(result.finger) || !isTypeCode(result.type)) {
        return notFound();
      }

      const report = await loadReport(result.finger as DemoFinger, result.type as TypeCode);
      return {
        finger: result.finger,
        typeCode: result.type,
        confidence: result.confidence,
        notes: result.notes,
        report
      };
    })
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <BasicReportBundleView
        sessionId={scanSession.id}
        tokenPrefix={scanSession.tokenPrefix}
        completedAt={scanSession.completedAt}
        items={items}
      />
    </main>
  );
}
