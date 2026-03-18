import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/ReportView";
import { isDemoFinger, isTypeCode } from "@/lib/dmit/constants";
import { loadReport } from "@/lib/dmit/loader";

export const dynamic = "force-dynamic";

interface ReportPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ReportPage(props: ReportPageProps) {
  const searchParams = await props.searchParams;
  const finger = searchParams.finger;
  const typeCode = searchParams.type;
  const confidence = searchParams.confidence;

  if (typeof finger !== "string" || !isDemoFinger(finger)) {
    return notFound();
  }
  if (typeof typeCode !== "string" || !isTypeCode(typeCode)) {
    return notFound();
  }

  const confidenceNum = typeof confidence === "string" ? parseFloat(confidence) : 0;
  
  try {
    const report = await loadReport(finger, typeCode);
    
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <ReportView 
          report={report} 
          typeCode={typeCode} 
          confidence={confidenceNum} 
        />
      </main>
    );
  } catch (error) {
    console.error("Failed to load report", error);
    return notFound();
  }
}
