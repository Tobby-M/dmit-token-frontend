"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/scan/CameraCapture";
import type { AccessTier } from "@/lib/access/shared";
import { getTierLabel } from "@/lib/access/shared";
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

interface AccessSessionState {
  tier: AccessTier;
  tokenPrefix: string | null;
}

interface AccessSessionResponse {
  resolved: boolean;
  session: AccessSessionState | null;
}

interface AccessResolveResponse {
  ok: true;
  session: AccessSessionState;
}

export default function HomePage() {
  const router = useRouter();
  const [selectedFinger, setSelectedFinger] = useState<DemoFinger>("Left Thumb");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessState, setAccessState] = useState<"checking" | "gated" | "ready">("checking");
  const [accessSession, setAccessSession] = useState<AccessSessionState | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadAccessSession() {
      try {
        const response = await fetch("/api/access/session", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Unable to verify your access session.");
        }

        const payload = (await response.json()) as AccessSessionResponse;
        if (isCancelled) {
          return;
        }

        if (!payload.resolved || !payload.session) {
          setAccessSession(null);
          setAccessState("gated");
          return;
        }

        setAccessSession(payload.session);
        setAccessState("ready");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAccessError(
          error instanceof Error ? error.message : "Unable to verify your access session."
        );
        setAccessState("gated");
      }
    }

    void loadAccessSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  const previewText = useMemo(() => {
    if (!capturedImage) {
      return "No capture yet";
    }
    return "Fingerprint captured and ready for AI analysis";
  }, [capturedImage]);

  const currentTierLabel = accessSession ? getTierLabel(accessSession.tier) : null;
  const canAnalyze = accessSession?.tier !== "premium";

  async function resolveAccess(token: string) {
    setAccessPending(true);
    setAccessError(null);

    try {
      const response = await fetch("/api/access/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });

      const payload = (await response.json()) as AccessResolveResponse | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error(("error" in payload && payload.error) || "Unable to resolve access.");
      }

      setAccessToken("");
      setAccessSession(payload.session);
      setAccessState("ready");
      setCapturedImage(null);
      setErrorMessage(null);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unable to resolve access.");
    } finally {
      setAccessPending(false);
    }
  }

  async function resetAccess() {
    setAccessPending(true);
    setAccessError(null);

    try {
      await fetch("/api/access/logout", {
        method: "POST"
      });

      setAccessSession(null);
      setAccessState("gated");
      setCapturedImage(null);
      setErrorMessage(null);
      setLoading(false);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unable to reset access.");
    } finally {
      setAccessPending(false);
    }
  }

  const analyzeCapture = async () => {
    if (!capturedImage) {
      setErrorMessage("Capture a fingerprint image first.");
      return;
    }

    if (!accessSession) {
      setErrorMessage("Resolve your access tier before starting a scan.");
      return;
    }

    if (!canAnalyze) {
      setErrorMessage("Premium flow does not use live AI analysis.");
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
      router.push(
        `/report?finger=${encodeURIComponent(finger)}&type=${encodeURIComponent(type)}&confidence=${confidence}` as any
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to classify fingerprint");
      setLoading(false);
    }
  };

  if (accessState === "checking") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <section className="w-full rounded-[2rem] border border-brass/25 bg-white/78 p-8 text-center shadow-card backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">DMIT Frontend</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink">Checking access</h1>
          <p className="mt-3 text-sm leading-7 text-ink/72">
            Restoring your current session before loading the scanner.
          </p>
        </section>
      </main>
    );
  }

  if (accessState === "gated") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-brass/25 bg-white/78 p-6 shadow-card backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
            DMIT Frontend
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">
            Choose your access tier
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/72">
            Free trial users can continue without a token. Basic and Premium users unlock their
            tier by entering the access token generated in the admin console.
          </p>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,420px)]">
          <section className="grid gap-4 lg:grid-cols-3">
            <AccessTierCard
              eyebrow="Free"
              title="Free Trial"
              points={[
                "No token required",
                "Single scan at a time",
                "Unlocks the current demo scanner"
              ]}
            />
            <AccessTierCard
              eyebrow="Token"
              title="Basic Plan"
              points={[
                "Enter a valid Basic token",
                "Current demo uses the 4 supported fingers",
                "AI classification stays enabled"
              ]}
            />
            <AccessTierCard
              eyebrow="Manual"
              title="Premium Plan"
              points={[
                "Enter a valid Premium token",
                "Reserved for the manual 10-finger flow",
                "Live AI scanner remains disabled"
              ]}
            />
          </section>

          <section className="space-y-5 rounded-[2rem] border border-brass/30 bg-white p-5 shadow-card">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                Start Here
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Unlock the scanner</h2>
              <p className="mt-2 text-sm leading-7 text-ink/72">
                Continue as Free Trial or enter a Basic/Premium token.
              </p>
            </div>

            <button
              type="button"
              className="w-full rounded-2xl bg-pine px-4 py-3 text-base font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/40"
              disabled={accessPending}
              onClick={() => void resolveAccess("")}
            >
              {accessPending ? "Opening..." : "Continue with Free Trial"}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-brass/20" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">
                or
              </span>
              <div className="h-px flex-1 bg-brass/20" />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-ink" htmlFor="access-token">
                Access token
              </label>
              <input
                id="access-token"
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value.toUpperCase())}
                placeholder="BSC-XXXXXX-XXXXXXXX or PRM-XXXXXX-XXXXXXXX"
                className="w-full rounded-2xl border border-brass/35 bg-canvas px-4 py-3 text-base text-ink outline-none transition focus:border-pine/45 focus:ring-4 focus:ring-pine/10"
              />
              <button
                type="button"
                className="w-full rounded-2xl bg-brass px-4 py-3 text-base font-semibold text-white transition hover:bg-brass/90 disabled:cursor-not-allowed disabled:bg-brass/40"
                disabled={!accessToken.trim() || accessPending}
                onClick={() => void resolveAccess(accessToken)}
              >
                {accessPending ? "Validating..." : "Unlock with Token"}
              </button>
            </div>

            {accessError ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {accessError}
              </p>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  if (!accessSession) {
    return null;
  }

  if (accessSession.tier === "premium") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-brass/25 bg-white/78 p-6 shadow-card backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                {currentTierLabel}
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-ink">Premium manual flow</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink/72">
                Your Premium token has been validated. The guided 10-finger capture and manual lab
                handoff flow is the next implementation step, so live AI analysis is intentionally
                disabled here.
              </p>
            </div>

            <button
              type="button"
              className="rounded-xl border border-brass/30 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={accessPending}
              onClick={() => void resetAccess()}
            >
              Change access
            </button>
          </div>
        </header>

        <section className="mt-6 grid gap-4 rounded-[2rem] border border-dashed border-brass/35 bg-white/70 p-6 shadow-card">
          <div className="rounded-2xl bg-canvas/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
              Valid token
            </p>
            <p className="mt-2 text-base font-semibold text-ink">
              {accessSession.tokenPrefix ?? "Premium session active"}
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-brass/20 bg-white p-5">
            <p className="text-sm font-semibold text-ink">What comes next</p>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-ink/72">
              <li>Guided 10-finger capture across both hands</li>
              <li>Processed image packaging for cloud upload</li>
              <li>Manual lab handoff instead of live Gemini classification</li>
            </ul>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <header className="rounded-2xl border border-brass/30 bg-white/70 p-4 shadow-card backdrop-blur print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
              {currentTierLabel}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Fingerprint Scan & Report</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/80">
              Access is now token-gated. Free and Basic users can use the current scan demo while
              tier-specific guided flows are implemented next.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {accessSession.tokenPrefix ? (
              <span className="rounded-full border border-brass/25 bg-canvas px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
                {accessSession.tokenPrefix}
              </span>
            ) : null}

            <button
              type="button"
              className="rounded-xl border border-brass/30 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={accessPending}
              onClick={() => void resetAccess()}
            >
              Change access
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] print:block">
        <div className="space-y-5 print:hidden">
          <section className="space-y-3 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-ink" htmlFor="finger-select">
                Finger To Scan
              </label>
              <span className="rounded-full bg-pine/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-pine">
                {currentTierLabel}
              </span>
            </div>
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
            <p className="text-xs leading-6 text-ink/60">
              The guided tier-specific scan sequence is the next step. For now, Free and Basic
              access unlock the existing demo finger set.
            </p>
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

        <section className="hidden rounded-[2rem] border border-dashed border-brass/30 bg-white/55 p-8 text-center shadow-card xl:flex xl:min-h-[720px] xl:flex-col xl:items-center xl:justify-center print:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">Awaiting Scan</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink">Scan To See Details</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-ink/72">
            Capture one of the supported demo fingerprints, run the AI classification, and you will
            be redirected to the detailed DMIT report for that type.
          </p>
        </section>
      </div>
    </main>
  );
}

function AccessTierCard(props: {
  eyebrow: string;
  title: string;
  points: string[];
}) {
  return (
    <article className="rounded-[1.75rem] border border-brass/25 bg-white/75 p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">{props.eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-ink">{props.title}</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-ink/72">
        {props.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </article>
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
