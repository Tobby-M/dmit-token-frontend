"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/scan/CameraCapture";
import {
  BASIC_SCAN_SEQUENCE,
  FREE_FINGER_OPTIONS,
  PREMIUM_SCAN_SEQUENCE,
  getFreeFingerFromChoice,
  type FreeFingerChoice
} from "@/lib/access/scan-flow";
import {
  getTierLabel,
  type PublicAccessSession,
  type ScanSessionSummary
} from "@/lib/access/shared";
import { toHighContrastFingerprint } from "@/lib/image/fingerprint-processing";
import type { DemoFinger } from "@/lib/dmit/constants";
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
  session: ScanSessionSummary;
}

interface SessionMutationResponse {
  ok: true;
  session: ScanSessionSummary;
}

interface AccessSessionResponse {
  resolved: boolean;
  session: PublicAccessSession | null;
}

interface AccessResolveResponse {
  ok: true;
  session: PublicAccessSession;
}

interface ApiErrorPayload {
  error?: string;
  details?: string;
  recaptureRequired?: boolean;
}

interface FailureFeedback {
  message: string;
  guidance: string | null;
}

function cleanFailureDetails(details?: string): string | null {
  if (!details) {
    return null;
  }

  const normalized = details
    .replace(/^Low confidence classification\s*\([^)]+\)\.?\s*/i, "")
    .replace(/^Notes:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function getRecaptureGuidance(
  currentFinger: string | null,
  tier: PublicAccessSession["tier"] | null
): string {
  const fingerLabel = currentFinger ?? "the highlighted finger";

  if (tier === "premium") {
    return `Recapture ${fingerLabel} with the fingertip centered, evenly lit, and fully in frame before saving again. If the live preview keeps washing it out, switch to Native Camera / Upload.`;
  }

  return `Recapture ${fingerLabel} with the ridges dark, sharp, and centered in frame. If the live preview keeps washing it out, switch to Native Camera / Upload before analyzing again.`;
}

function describeScannerFailure(
  payload: ApiErrorPayload,
  options: {
    currentFinger: string | null;
    tier: PublicAccessSession["tier"] | null;
    fallbackMessage: string;
  }
): FailureFeedback {
  const message = payload.error?.trim() || options.fallbackMessage;
  const detail = cleanFailureDetails(payload.details);

  if (payload.recaptureRequired) {
    return {
      message:
        options.currentFinger !== null
          ? `${options.currentFinger} needs a cleaner capture before the scanner can continue.`
          : message,
      guidance: [detail, getRecaptureGuidance(options.currentFinger, options.tier)]
        .filter(Boolean)
        .join(" ")
    };
  }

  if (/Capture .+ next to stay in(?: the)? (?:Basic )?sequence\./i.test(message)) {
    return {
      message,
      guidance:
        "The scanner only unlocks one finger at a time. Follow the highlighted order so the Basic session stays valid."
    };
  }

  if (/locked to/i.test(message) || /Free Trial only supports/i.test(message)) {
    return {
      message,
      guidance:
        "Free Trial only supports the Thumb or Index choice you selected at the start of the session."
    };
  }

  if (/Finger mismatch detected/i.test(message)) {
    return {
      message,
      guidance:
        "Retake the same finger shown in the Current Finger panel. Switching fingers mid-step invalidates the current scan."
    };
  }

  if (
    /Unsupported image type|Image file is empty|Image is too large|Fingerprint image file is required/i.test(
      message
    )
  ) {
    return {
      message,
      guidance:
        "Use a clear JPG, PNG, or WEBP fingerprint image under 7 MB. If live capture keeps failing, switch to Native Camera / Upload."
    };
  }

  if (/Premium scans do not use the live AI classification flow/i.test(message)) {
    return {
      message,
      guidance:
        "Premium only saves processed captures. Use Save instead of Analyze, then finalize after all 10 fingers are complete."
    };
  }

  if (/Gemini|Classification service failed/i.test(message)) {
    return {
      message,
      guidance:
        detail ??
        "The classifier service could not finish this request. Retry after another capture or check the server configuration if it keeps happening."
    };
  }

  return {
    message,
    guidance: detail
  };
}

export default function HomePage() {
  const router = useRouter();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorGuidance, setErrorGuidance] = useState<string | null>(null);
  const [flowMessage, setFlowMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingCapture, setProcessingCapture] = useState(false);
  const [accessState, setAccessState] = useState<"checking" | "gated" | "ready">("checking");
  const [accessSession, setAccessSession] = useState<PublicAccessSession | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [freeFingerChoice, setFreeFingerChoice] = useState<FreeFingerChoice>("thumb");

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

  const currentTierLabel = accessSession ? getTierLabel(accessSession.tier) : null;
  const currentScanSession = accessSession?.scanSession ?? null;
  const basicResults = currentScanSession?.basicResults ?? [];
  const premiumCaptures = currentScanSession?.premiumCaptures ?? [];
  const completedCount = currentScanSession?.completedCount ?? 0;
  const basicCompleted = accessSession?.tier === "basic" && currentScanSession?.isComplete === true;
  const premiumCompleted =
    accessSession?.tier === "premium" && currentScanSession?.isComplete === true;
  const readyForCompletion = currentScanSession?.readyForCompletion ?? false;

  const currentFinger = useMemo(() => {
    if (!accessSession) {
      return null;
    }

    if (accessSession.tier === "free") {
      return getFreeFingerFromChoice(freeFingerChoice);
    }

    return accessSession.scanSession.nextFinger;
  }, [accessSession, freeFingerChoice]);

  const previewText = useMemo(() => {
    if (processingCapture) {
      return "Processing capture into high-contrast black-and-white.";
    }

    if (!capturedImage) {
      return currentFinger
        ? `Capture ${currentFinger} to continue. The preview will switch to processed black-and-white before analysis or save.`
        : "No capture yet.";
    }

    return accessSession?.tier === "premium"
      ? "Processed Premium capture ready to save into the session."
      : "Processed fingerprint ready for AI analysis.";
  }, [accessSession?.tier, capturedImage, currentFinger, processingCapture]);

  function clearScannerFeedback() {
    setErrorMessage(null);
    setErrorGuidance(null);
    setFlowMessage(null);
  }

  function showScannerFailure(message: string, guidance?: string | null) {
    setErrorMessage(message);
    setErrorGuidance(guidance ?? null);
    setFlowMessage(null);
  }

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
      setErrorGuidance(null);
      setFlowMessage(null);
      setProcessingCapture(false);
      setFreeFingerChoice("thumb");
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
      setErrorGuidance(null);
      setFlowMessage(null);
      setLoading(false);
      setProcessingCapture(false);
      setFreeFingerChoice("thumb");
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unable to reset access.");
    } finally {
      setAccessPending(false);
    }
  }

  function updateScanSession(session: ScanSessionSummary) {
    setAccessSession((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        scanSession: session
      };
    });
  }

  async function finalizeCurrentSession(options?: {
    successMessage?: string;
  }): Promise<ScanSessionSummary | null> {
    const response = await fetch("/api/scan/complete", {
      method: "POST"
    });

    const payload = (await response.json()) as SessionMutationResponse | { error?: string };
    if (!response.ok || !("ok" in payload)) {
      throw new Error(("error" in payload && payload.error) || "Unable to finalize the scan.");
    }

    updateScanSession(payload.session);
    if (options?.successMessage) {
      setFlowMessage(options.successMessage);
    }

    return payload.session;
  }

  function openReport(finger: string, type: string, confidence: number) {
    router.push(
      `/report?finger=${encodeURIComponent(finger)}&type=${encodeURIComponent(type)}&confidence=${confidence}` as any
    );
  }

  function openBasicReport(sessionId: string) {
    router.push(`/report/basic?sessionId=${encodeURIComponent(sessionId)}` as any);
  }

  async function analyzeCapture() {
    if (!capturedImage) {
      showScannerFailure(
        "Capture a fingerprint image first.",
        getRecaptureGuidance(currentFinger, accessSession?.tier ?? null)
      );
      return;
    }

    if (!accessSession || !currentFinger) {
      showScannerFailure("Resolve your access tier before starting a scan.");
      return;
    }

    if (accessSession.tier === "premium") {
      showScannerFailure(
        "Premium flow does not use live AI analysis.",
        "Use Save to store the processed capture, then finalize after all 10 fingers are complete."
      );
      return;
    }

    setLoading(true);
    clearScannerFeedback();

    try {
      const imageBlob = dataUrlToBlob(capturedImage);
      const formData = new FormData();
      formData.append("selectedFinger", currentFinger);
      formData.append("image", imageBlob, `fingerprint-${Date.now()}.jpg`);

      const response = await fetch("/api/classify", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as ScanResponse | ApiErrorPayload;
      if (!response.ok || !("ok" in payload)) {
        throw describeScannerFailure(payload as ApiErrorPayload, {
          currentFinger,
          tier: accessSession.tier,
          fallbackMessage: "Failed to classify fingerprint."
        });
      }

      updateScanSession(payload.session);
      setCapturedImage(null);
      setErrorGuidance(null);

      if (accessSession.tier === "free") {
        await finalizeCurrentSession();
        const { finger, type, confidence } = payload.classification;
        router.push(
          `/report?finger=${encodeURIComponent(finger)}&type=${encodeURIComponent(type)}&confidence=${confidence}` as any
        );
        return;
      }

      if (payload.session.readyForCompletion) {
        await finalizeCurrentSession({
          successMessage:
            "Basic scan sequence complete. Token usage has been updated and the results are ready."
        });
        return;
      }

      const nextFinger = payload.session.nextFinger;
      setFlowMessage(
        nextFinger
          ? `${payload.classification.finger} complete. Next finger: ${nextFinger}.`
          : `${payload.classification.finger} complete.`
      );
    } catch (error) {
      if (error && typeof error === "object" && "message" in error && "guidance" in error) {
        const feedback = error as FailureFeedback;
        showScannerFailure(feedback.message, feedback.guidance);
      } else {
        showScannerFailure(
          error instanceof Error ? error.message : "Failed to classify fingerprint."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function savePremiumCapture() {
    if (!capturedImage) {
      showScannerFailure(
        "Capture a fingerprint image first.",
        getRecaptureGuidance(currentFinger, accessSession?.tier ?? null)
      );
      return;
    }

    if (!accessSession || accessSession.tier !== "premium" || !currentFinger) {
      showScannerFailure("Resolve a Premium session before saving captures.");
      return;
    }

    setLoading(true);
    clearScannerFeedback();

    try {
      const imageBlob = dataUrlToBlob(capturedImage);
      const formData = new FormData();
      formData.append("selectedFinger", currentFinger);
      formData.append("image", imageBlob, `premium-${Date.now()}.jpg`);

      const response = await fetch("/api/scan/capture", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as SessionMutationResponse | ApiErrorPayload;
      if (!response.ok || !("ok" in payload)) {
        throw describeScannerFailure(payload as ApiErrorPayload, {
          currentFinger,
          tier: accessSession.tier,
          fallbackMessage: "Unable to save Premium capture."
        });
      }

      updateScanSession(payload.session);
      setCapturedImage(null);
      setErrorGuidance(null);

      if (payload.session.readyForCompletion) {
        await finalizeCurrentSession({
          successMessage:
            "Premium capture sequence complete. Processed files are stored and the token has been consumed."
        });
        return;
      }

      setFlowMessage(
        payload.session.nextFinger
          ? `${currentFinger} saved. Next finger: ${payload.session.nextFinger}.`
          : `${currentFinger} saved.`
      );
    } catch (error) {
      if (error && typeof error === "object" && "message" in error && "guidance" in error) {
        const feedback = error as FailureFeedback;
        showScannerFailure(feedback.message, feedback.guidance);
      } else {
        showScannerFailure(
          error instanceof Error ? error.message : "Unable to save Premium capture."
        );
      }
    } finally {
      setLoading(false);
    }
  }

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
                "1 finger only",
                "Choose Thumb or Index before the camera starts"
              ]}
            />
            <AccessTierCard
              eyebrow="Token"
              title="Basic Plan"
              points={[
                "Enter a valid Basic token",
                "Guided 4-finger sequence",
                "Token is consumed only after the sequence is completed"
              ]}
            />
            <AccessTierCard
              eyebrow="Manual"
              title="Premium Plan"
              points={[
                "Enter a valid Premium token",
                "Guided 10-finger capture across both hands",
                "Processed images are saved for manual review"
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

  if (!accessSession || !currentScanSession) {
    return null;
  }

  const showCaptureWorkspace = !currentScanSession.isComplete;
  const sequence =
    accessSession.tier === "basic"
      ? BASIC_SCAN_SEQUENCE
      : accessSession.tier === "premium"
        ? PREMIUM_SCAN_SEQUENCE
        : null;

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
              {accessSession.tier === "premium"
                ? "Premium sessions save processed captures for manual review. The token is consumed only after all 10 captures are finalized."
                : "Free uses one finger and Basic follows the required 4-finger sequence. Tokens are consumed only after a successful session completion."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {accessSession.tokenPrefix ? (
              <span className="rounded-full border border-brass/25 bg-canvas px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
                {accessSession.tokenPrefix}
              </span>
            ) : null}

            <span className="rounded-full bg-pine/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-pine">
              {completedCount}/{currentScanSession.requiredFingerCount} complete
            </span>

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
          {accessSession.tier === "free" ? (
            <section className="space-y-4 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                  Free Tier Finger Selection
                </p>
                <h2 className="text-xl font-semibold text-ink">Choose one finger</h2>
                <p className="text-sm leading-6 text-ink/72">
                  The Free flow only exposes two choices before the camera starts: Thumb or Index.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {FREE_FINGER_OPTIONS.map((option) => {
                  const selected = freeFingerChoice === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setFreeFingerChoice(option.value);
                        setCapturedImage(null);
                        setErrorMessage(null);
                        setErrorGuidance(null);
                        setFlowMessage(null);
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? "border-pine bg-pine/8 shadow-sm"
                          : "border-brass/25 bg-canvas/40 hover:bg-canvas"
                      }`}
                    >
                      <p className="text-base font-semibold text-ink">{option.label}</p>
                      <p className="mt-2 text-sm leading-6 text-ink/70">{option.description}</p>
                    </button>
                  );
                })}
              </div>

              <p className="rounded-2xl bg-canvas/70 px-4 py-3 text-xs leading-6 text-ink/65">
                Temporary demo mapping: Thumb uses <strong>Left Thumb</strong> and Index uses{" "}
                <strong>Left Index</strong> until the full free-tier capture rule is finalized.
              </p>
            </section>
          ) : sequence ? (
            <section className="space-y-4 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                    {accessSession.tier === "basic" ? "Guided Basic Flow" : "Guided Premium Flow"}
                  </p>
                  <h2 className="text-xl font-semibold text-ink">
                    Step{" "}
                    {Math.min(
                      currentScanSession.completedCount + 1,
                      currentScanSession.requiredFingerCount
                    )}{" "}
                    of {currentScanSession.requiredFingerCount}
                  </h2>
                  <p className="text-sm leading-6 text-ink/72">
                    {accessSession.tier === "basic"
                      ? "Basic access dictates the finger order and keeps AI enabled."
                      : "Premium captures all 10 fingers in order and stores processed images for manual review."}
                  </p>
                </div>

                <span className="rounded-full bg-pine/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-pine">
                  {completedCount}/{currentScanSession.requiredFingerCount} complete
                </span>
              </div>

              <ol className={`grid gap-3 ${accessSession.tier === "premium" ? "sm:grid-cols-2" : ""}`}>
                {sequence.map((finger, index) => {
                  const completed = index < currentScanSession.completedCount;
                  const current = index === currentScanSession.completedCount && !currentScanSession.isComplete;

                  return (
                    <li
                      key={finger}
                      className={`rounded-2xl border px-4 py-3 ${
                        completed
                          ? "border-pine/25 bg-pine/8"
                          : current
                            ? "border-brass/40 bg-canvas/80"
                            : "border-brass/20 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{finger}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">
                            {completed ? "Completed" : current ? "Current finger" : "Upcoming"}
                          </p>
                        </div>

                        {completed ? (
                          <span className="rounded-full bg-pine/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-pine">
                            Done
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {showCaptureWorkspace ? (
            <>
              <section className="rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                      Current Finger
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-ink">
                      {currentFinger ?? "Waiting"}
                    </h2>
                  </div>
                  <span className="rounded-full bg-canvas px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                    {currentTierLabel}
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                  Capture Checklist
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/78">
                  <li>Center {currentFinger ?? "the highlighted finger"} and fill most of the frame.</li>
                  <li>Keep the fingertip steady so the ridges stay dark and sharp.</li>
                  <li>Avoid bright flash hotspots. If the preview looks washed out, switch to Native Camera / Upload.</li>
                </ul>
              </section>

              <CameraCapture
                disabled={loading || processingCapture || !currentFinger}
                onCapture={async (imageDataUrl) => {
                  setProcessingCapture(true);
                  setErrorMessage(null);
                  setErrorGuidance(null);
                  setFlowMessage(null);

                  try {
                    const processedImage = await toHighContrastFingerprint(imageDataUrl);
                    setCapturedImage(processedImage);
                    setFlowMessage(
                      "Capture processed to high-contrast black-and-white. Confirm the ridges look dark and readable before continuing."
                    );
                  } catch (error) {
                    setCapturedImage(imageDataUrl);
                    showScannerFailure(
                      error instanceof Error
                        ? error.message
                        : "Unable to process the captured fingerprint image.",
                      "Retake the fingerprint with better contrast, or switch to Native Camera / Upload if processing keeps failing."
                    );
                  } finally {
                    setProcessingCapture(false);
                  }
                }}
              />

              <section className="space-y-3 rounded-2xl border border-brass/30 bg-white p-4 shadow-card">
                <p className="text-sm text-ink/80">{previewText}</p>
                {capturedImage ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">
                      Processed Preview
                    </p>
                    <img
                      src={capturedImage}
                      alt="Processed fingerprint preview"
                      className="h-40 w-full rounded-xl border border-brass/30 object-cover"
                    />
                  </div>
                ) : null}

                {readyForCompletion ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void finalizeCurrentSession({
                        successMessage:
                          accessSession.tier === "premium"
                            ? "Premium session finalized and token usage updated."
                            : "Basic session finalized and token usage updated."
                      }).catch((error) => {
                        showScannerFailure(
                          error instanceof Error ? error.message : "Unable to finalize the scan."
                        );
                      })
                    }
                    className="w-full rounded-xl bg-pine px-4 py-3 text-base font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/40"
                  >
                    {loading ? "Finalizing..." : "Finalize session"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!capturedImage || loading || processingCapture || !currentFinger}
                    onClick={() =>
                      void (accessSession.tier === "premium" ? savePremiumCapture() : analyzeCapture())
                    }
                    className="w-full rounded-xl bg-brass px-4 py-3 text-base font-semibold text-white transition hover:bg-brass/90 disabled:cursor-not-allowed disabled:bg-brass/40"
                  >
                    {processingCapture
                      ? "Processing capture..."
                      : loading
                        ? accessSession.tier === "premium"
                          ? "Saving..."
                          : "Analyzing..."
                        : accessSession.tier === "premium"
                          ? `Save ${currentFinger ?? "Current Finger"}`
                          : accessSession.tier === "basic"
                            ? `Analyze ${currentFinger ?? "Current Finger"}`
                            : "Analyze"}
                  </button>
                )}

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p className="font-semibold">{errorMessage}</p>
                    {errorGuidance ? (
                      <p className="mt-1 leading-6 text-red-700/90">{errorGuidance}</p>
                    ) : null}
                  </div>
                ) : null}
                {flowMessage ? <p className="text-sm text-pine">{flowMessage}</p> : null}
              </section>
            </>
          ) : null}
        </div>

        <section className="rounded-[2rem] border border-dashed border-brass/30 bg-white/55 p-8 shadow-card print:hidden">
          {basicCompleted ? (
            <div className="space-y-5">
              <CompletionStatusCard session={currentScanSession} />

              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                  Basic Sequence Complete
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-ink">Review the 4 scan results</h2>
                <p className="mt-3 text-sm leading-7 text-ink/72">
                  The four completed Basic fingerprints now feed into a bundled in-app report, while
                  the individual result cards remain available for quick review.
                </p>
              </div>

              <button
                type="button"
                className="w-full rounded-xl bg-pine px-4 py-3 text-base font-semibold text-white transition hover:bg-pine/90"
                onClick={() => openBasicReport(currentScanSession.id)}
              >
                Open Combined Basic Report
              </button>

              <div className="grid gap-4 md:grid-cols-2">
                {basicResults.map((result) => (
                  <article
                    key={result.finger}
                    className="rounded-[1.6rem] border border-brass/25 bg-white p-5 shadow-card"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                      {result.finger}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-ink">{result.abilityTitle}</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-canvas/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Type</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{result.type}</p>
                      </div>
                      <div className="rounded-2xl bg-canvas/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">
                          Confidence
                        </p>
                        <p className="mt-1 text-lg font-semibold text-ink">
                          {(result.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-ink/72">{result.notes}</p>
                    <button
                      type="button"
                      className="mt-5 w-full rounded-xl bg-pine px-4 py-3 text-sm font-semibold text-white transition hover:bg-pine/90"
                      onClick={() => openReport(result.finger, result.type, result.confidence)}
                    >
                      View report
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : premiumCompleted ? (
            <div className="space-y-5">
              <CompletionStatusCard session={currentScanSession} />

              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                  Premium Capture Complete
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-ink">
                  Processed capture package is ready
                </h2>
                <p className="mt-3 text-sm leading-7 text-ink/72">
                  All 10 processed Premium captures were stored for manual review. Live AI
                  classification remains disabled for this tier.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {premiumCaptures.map((capture) => (
                  <article
                    key={capture.finger}
                    className="rounded-2xl border border-brass/25 bg-white p-4 shadow-card"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">
                      {capture.finger}
                    </p>
                    <p className="mt-2 text-sm text-ink/72">
                      Saved as {capture.fileName ?? "processed image"}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">
                      {capture.processed ? "Processed" : "Raw"} • {formatTimestamp(capture.capturedAt)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : readyForCompletion ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center xl:min-h-[720px]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                Ready To Finalize
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-ink">
                All required captures are already recorded
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-ink/72">
                Finalize the session from the left panel to consume the token and lock the scan as
                complete.
              </p>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center xl:min-h-[720px]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                Awaiting Scan
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-ink">
                {accessSession.tier === "free"
                  ? "Choose and scan one finger"
                  : accessSession.tier === "basic"
                    ? "Follow the guided Basic sequence"
                    : "Follow the guided Premium sequence"}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-ink/72">
                {accessSession.tier === "free"
                  ? "Select Thumb or Index, capture the fingerprint, and continue into the report flow."
                  : accessSession.tier === "basic"
                    ? "Capture and analyze each required finger in order. Completed Basic results will stay here until the sequence is done."
                    : "Capture each Premium finger in order. Every processed image will be stored and the token will only be consumed after the full 10-finger set is finalized."}
              </p>
            </div>
          )}
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

function CompletionStatusCard(props: {
  session: ScanSessionSummary;
}) {
  const { redemption } = props.session;

  return (
    <section className="grid gap-4 rounded-[1.6rem] border border-brass/25 bg-white p-5 shadow-card md:grid-cols-3">
      <div className="rounded-2xl bg-canvas/80 p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Session Status</p>
        <p className="mt-2 text-lg font-semibold text-ink">
          {props.session.status === "completed" ? "Completed" : props.session.status}
        </p>
      </div>
      <div className="rounded-2xl bg-canvas/80 p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Token Usage</p>
        <p className="mt-2 text-lg font-semibold text-ink">
          {redemption.consumed ? "Consumed" : "Not required"}
        </p>
        {redemption.consumedAt ? (
          <p className="mt-1 text-xs text-ink/60">{formatTimestamp(redemption.consumedAt)}</p>
        ) : null}
      </div>
      <div className="rounded-2xl bg-canvas/80 p-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">Remaining Uses</p>
        <p className="mt-2 text-lg font-semibold text-ink">
          {redemption.afterRemainingUses ?? "Free"}
        </p>
        {redemption.resultingStatus ? (
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/50">
            {redemption.resultingStatus}
          </p>
        ) : null}
      </div>
    </section>
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

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}
