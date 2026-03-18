"use client";

import { useEffect, useRef, useState } from "react";
import { Camera01Icon, Folder01Icon, Image01Icon, Idea01Icon } from "hugeicons-react";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  disabled?: boolean;
}

export function CameraCapture({ onCapture, disabled = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<"live" | "file">("live");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [focusState, setFocusState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
      if (isMobile) {
        setMode("file");
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    if (mode !== "live") {
      stopStream();
      return;
    }

    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const [track] = stream.getVideoTracks();
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        const supportsTorch = Boolean(capabilities.torch);
        setTorchSupported(supportsTorch);

        if (supportsTorch) {
          try {
            await track.applyConstraints({
              advanced: [{ torch: true } as MediaTrackConstraintSet]
            });
            setTorchEnabled(true);
          } catch {
            setTorchEnabled(false);
          }
        }

        setCameraReady(true);
        setCameraError(null);
      } catch (error) {
        setCameraError(
          error instanceof Error ? error.message : "Unable to access camera on this device"
        );
        setCameraReady(false);
      }
    };

    void setup();

    return () => {
      active = false;
      stopStream();
    };
  }, [mode]);

  const handleVideoTap = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      const constraints: any = { advanced: [{}] };
      let hasConstraints = false;

      // Ensure flash stays on if it was successfully enabled
      if (torchSupported && torchEnabled) {
        constraints.advanced[0].torch = true;
        hasConstraints = true;
      }

      // Try focus
      if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
        if (capabilities.focusMode.includes("continuous")) {
          constraints.advanced[0].focusMode = "continuous";
          hasConstraints = true;
        } else if (capabilities.focusMode.includes("single-shot")) {
          constraints.advanced[0].focusMode = "single-shot";
          hasConstraints = true;
        }
      }

      // Try lowering exposure for fingerprints (often overblown with flash)
      if (capabilities.exposureCompensation) {
        const minExp = capabilities.exposureCompensation.min || -2;
        // Shift exposure down by ~1.0 stop, but respect the hardware minimum
        constraints.advanced[0].exposureCompensation = Math.max(minExp, -1.0);
        
        if (capabilities.exposureMode && Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes("continuous")) {
          constraints.advanced[0].exposureMode = "continuous";
        }
        hasConstraints = true;
      }

      if (hasConstraints) {
        await track.applyConstraints(constraints);
        setFocusState("Adjusted focus & exposure");
        setTimeout(() => setFocusState(null), 2500);
      } else {
        setFocusState("Advanced camera controls (focus/exposure) are not supported by this browser.");
        setTimeout(() => setFocusState(null), 4000);
      }
    } catch (err) {
      console.warn("Failed to apply advanced camera constraints:", err);
      setFocusState("Hardware rejected focus/exposure request.");
      setTimeout(() => setFocusState(null), 2500);
    }
  };

  const captureLive = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        onCapture(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input after reading to allow same-file re-uploads
  };

  return (
    <section className="space-y-4 rounded-2xl border border-brass/30 bg-clay/40 p-4 shadow-card">
      <div className="flex gap-2 rounded-xl bg-white/50 p-1">
        <button
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            mode === "live" ? "bg-white text-pine shadow" : "text-ink/60 hover:text-ink"
          }`}
          onClick={() => setMode("live")}
          disabled={disabled}
        >
          Live Preview
        </button>
        <button
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            mode === "file" ? "bg-white text-pine shadow" : "text-ink/60 hover:text-ink"
          }`}
          onClick={() => setMode("file")}
          disabled={disabled}
        >
          Native Camera / Upload
        </button>
      </div>

      <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink/80">
        <Idea01Icon className="h-5 w-5 text-pine" /> For best results, ensure the fingerprint lines (ridges and valleys) are clearly visible and the image is in focus.
      </p>

      {mode === "live" ? (
        <div className="space-y-3">
          <div 
            className="group relative cursor-pointer overflow-hidden rounded-xl bg-black"
            onClick={handleVideoTap}
          >
            <video
              ref={videoRef}
              className="aspect-[3/4] w-full object-cover transition duration-300 group-hover:opacity-90"
              muted
              playsInline
              autoPlay
            />
            {cameraReady ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="rounded-xl border-2 border-dashed border-white/50 bg-black/20 p-8 opacity-0 transition group-hover:opacity-100">
                  <p className="text-sm font-medium text-white shadow-black drop-shadow-md">
                    Tap to auto-focus & lower exposure
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl bg-white/70 p-3 text-sm text-ink/80">
            {!cameraReady && !cameraError ? "Starting camera..." : null}
            {cameraError ? `Camera error: ${cameraError}` : null}
            {cameraReady && torchSupported && torchEnabled ? "Flash requested: ON. " : null}
            {cameraReady && focusState ? (
              <span className="font-semibold text-pine">{focusState}</span>
            ) : null}
            {cameraReady && !torchSupported && !focusState
              ? "Flash is not supported on this device."
              : null}
          </div>

          <button
            type="button"
            onClick={captureLive}
            disabled={!cameraReady || disabled}
            className="w-full rounded-xl bg-pine px-4 py-3 text-base font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/40"
          >
            Capture Fingerprint
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={cameraInputRef}
            onChange={handleFileUpload}
          />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-pine/30 bg-pine/10 px-4 py-8 text-lg font-semibold text-pine transition hover:bg-pine/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera01Icon className="h-6 w-6" /> Open Native Camera App
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brass/50 bg-white px-4 py-4 text-sm font-medium text-ink/80 shadow-sm transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Image01Icon className="h-5 w-5" /> Upload from Gallery
          </button>
        </div>
      )}
    </section>
  );
}
