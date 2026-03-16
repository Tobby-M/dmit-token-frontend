"use client";

import { useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  disabled?: boolean;
}

export function CameraCapture({ onCapture, disabled = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  useEffect(() => {
    let active = true;

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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const capture = () => {
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

  return (
    <section className="space-y-3 rounded-2xl border border-brass/30 bg-clay/40 p-3 shadow-card">
      <div className="overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[3/4] w-full object-cover"
          muted
          playsInline
          autoPlay
        />
      </div>

      <div className="rounded-xl bg-white/70 p-3 text-sm text-ink/80">
        {!cameraReady && !cameraError ? "Starting camera..." : null}
        {cameraError ? `Camera error: ${cameraError}` : null}
        {cameraReady && torchSupported && torchEnabled ? "Flash requested: ON" : null}
        {cameraReady && !torchSupported ? "Flash is not supported on this device. Capture will continue." : null}
        {cameraReady && torchSupported && !torchEnabled ? "Flash support detected but could not force ON." : null}
      </div>

      <button
        type="button"
        onClick={capture}
        disabled={!cameraReady || disabled}
        className="w-full rounded-xl bg-pine px-4 py-3 text-base font-semibold text-white transition hover:bg-pine/90 disabled:cursor-not-allowed disabled:bg-pine/40"
      >
        Capture Fingerprint
      </button>
    </section>
  );
}
