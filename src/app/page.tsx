"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/scan/CameraCapture";
import type { DemoFinger } from "@/lib/dmit/constants";
import { DEMO_FINGERS } from "@/lib/dmit/constants";
import type { DmitReport } from "@/lib/dmit/parser";

interface ScanResponse {
  ok: true;
  classification: {
    finger: DemoFinger;
    type: string;
    confidence: number;
    notes: string;
  };
  report: DmitReport;
}

export default function HomePage() {
  const router = useRouter();
  const [selectedFinger, setSelectedFinger] = useState<DemoFinger>("Left Thumb");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewText = useMemo(() => {
    if (!capturedImage) {
      return "No capture yet";
    }
    return "Fingerprint captured and ready for AI analysis";
  }, [capturedImage]);

  const analyzeCapture = async () => {
    if (!capturedImage) {
      setErrorMessage("Capture a fingerprint image first.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const imageBlob = dataUrlToBlob(capturedImage);
      const formData = new FormData();
      formData.append("selectedFinger", selectedFinger);
      formData.append("image", imageBlob, `fingerprint-${Date.now()}.jpg`);

      const response = await fetch("/api/classify", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as ScanResponse | { error?: string; details?: string };
      if (!response.ok || !("ok" in payload)) {
        const details = "details" in payload && payload.details ? ` ${payload.details}` : "";
        throw new Error(("error" in payload && payload.error) || `Classification failed.${details}`);
      }

      const { finger, type, confidence } = payload.classification;
      // skip typed routes check for dynamic template string
      router.push(`/report?finger=${encodeURIComponent(finger)}&type=${encodeURIComponent(type)}&confidence=${confidence}` as any);

    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to classify fingerprint");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <header className="rounded-2xl border border-brass/30 bg-white/70 p-4 shadow-card backdrop-blur print:hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">DMIT 4 Finger Demo</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Fingerprint Scan & Report</h1>
        <p className="mt-2 text-sm leading-6 text-ink/80">
          Select one finger, capture with rear camera, classify, and render the matching
          DMIT report from your dataset.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] print:block">
        <div className="space-y-5 print:hidden">
          <section className="space-y-3 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
            <label className="block text-sm font-medium text-ink" htmlFor="finger-select">
              Finger To Scan
            </label>
            <select
              id="finger-select"
              value={selectedFinger}
              onChange={(event) => setSelectedFinger(event.target.value as DemoFinger)}
              className="w-full rounded-xl border border-brass/40 bg-canvas px-3 py-3 text-base text-ink"
              disabled={loading}
            >
              {DEMO_FINGERS.map((finger) => (
                <option key={finger} value={finger}>
                  {finger}
                </option>
              ))}
            </select>
          </section>

          <CameraCapture
            disabled={loading}
            onCapture={(imageDataUrl) => {
              setCapturedImage(imageDataUrl);
              setErrorMessage(null);
            }}
          />

          <section className="space-y-3 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
            <p className="text-sm text-ink/80">{previewText}</p>
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured fingerprint"
                className="h-40 w-full rounded-xl border border-brass/30 object-cover"
              />
            ) : null}
            <button
              type="button"
              disabled={!capturedImage || loading}
              onClick={analyzeCapture}
              className="w-full rounded-xl bg-brass px-4 py-3 text-base font-semibold text-white transition hover:bg-brass/90 disabled:cursor-not-allowed disabled:bg-brass/40"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
            {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
          </section>
        </div>

        {/* Awaiting Scan Section */}
        <section className="hidden rounded-[2rem] border border-dashed border-brass/30 bg-white/55 p-8 text-center shadow-card xl:flex xl:min-h-[720px] xl:flex-col xl:items-center xl:justify-center print:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">Awaiting Scan</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink">Scan To See Details</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-ink/72">
            Capture one of the four demo fingerprints, run the AI classification, and you will be redirected to the full detailed DMIT report for that type.
          </p>
        </section>
      </div>
    </main>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid captured image payload.");
  }

  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);

  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}
