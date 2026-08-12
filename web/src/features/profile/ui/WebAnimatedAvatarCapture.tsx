import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Square, RefreshCw, Check } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface Props {
  onApply: (dataUrl: string) => void;
  onCancel: () => void;
}

type CaptureState =
  | "idle"
  | "requesting"
  | "preview"
  | "recording"
  | "encoding"
  | "review"
  | "error";

const RECORD_DURATION_MS = 2500;
const FRAME_INTERVAL_MS = 100;
const GIF_SIZE = 200;

export function WebAnimatedAvatarCapture({ onApply, onCancel }: Props) {
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [gifDataUrl, setGifDataUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const framesRef = useRef<ImageData[]>([]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (frameTimerRef.current !== null) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (recordTimerRef.current !== null) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const startCamera = useCallback(async () => {
    setCaptureState("requesting");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCaptureState("preview");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Camera access denied.");
      setCaptureState("error");
    }
  }, []);

  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, GIF_SIZE, GIF_SIZE);
    return ctx.getImageData(0, 0, GIF_SIZE, GIF_SIZE);
  }, []);

  const startRecording = useCallback(() => {
    framesRef.current = [];
    setCaptureState("recording");
    setCountdown(Math.ceil(RECORD_DURATION_MS / 1000));

    frameTimerRef.current = setInterval(() => {
      const frame = captureFrame();
      if (frame) framesRef.current.push(frame);
    }, FRAME_INTERVAL_MS);

    let remaining = RECORD_DURATION_MS;
    const countInterval = setInterval(() => {
      remaining -= 1000;
      setCountdown(Math.max(0, Math.ceil(remaining / 1000)));
    }, 1000);

    recordTimerRef.current = setTimeout(async () => {
      clearInterval(frameTimerRef.current!);
      clearInterval(countInterval);
      frameTimerRef.current = null;
      setCaptureState("encoding");

      try {
        const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
        const gif = GIFEncoder();
        for (const frame of framesRef.current) {
          const pixels = new Uint8Array(frame.data.buffer);
          const palette = quantize(pixels, 256);
          const indexed = applyPalette(pixels, palette);
          gif.writeFrame(indexed, GIF_SIZE, GIF_SIZE, {
            palette,
            delay: FRAME_INTERVAL_MS,
          });
        }
        gif.finish();
        const buffer = gif.bytesView();
        const blob = new Blob([buffer.buffer as ArrayBuffer], {
          type: "image/gif",
        });
        const reader = new FileReader();
        reader.onload = () => {
          setGifDataUrl(reader.result as string);
          setCaptureState("review");
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "GIF encoding failed.");
        setCaptureState("error");
      }
    }, RECORD_DURATION_MS);
  }, [captureFrame]);

  const handleApply = useCallback(() => {
    if (!gifDataUrl) return;
    stopStream();
    onApply(gifDataUrl);
  }, [gifDataUrl, stopStream, onApply]);

  const handleRetake = useCallback(() => {
    setGifDataUrl(null);
    setCaptureState("preview");
  }, []);

  const handleCancel = useCallback(() => {
    stopStream();
    onCancel();
  }, [stopStream, onCancel]);

  if (captureState === "error") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-destructive">
          {errorMsg || "Camera unavailable."}
        </p>
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Close
        </Button>
      </div>
    );
  }

  if (captureState === "idle") {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-black/50 dark:text-white/50">
          Capture a short animated avatar from your camera.
        </p>
        <Button onClick={() => void startCamera()}>
          <Camera className="mr-2 h-4 w-4" />
          Open camera
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  if (captureState === "requesting") {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Requesting camera access…
      </p>
    );
  }

  if (captureState === "encoding") {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Creating animated avatar…
      </p>
    );
  }

  if (captureState === "review" && gifDataUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <img
          src={gifDataUrl}
          alt="Animated avatar preview"
          className="h-32 w-32 rounded-full object-cover"
        />
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={handleRetake}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Retake
          </Button>
          <Button size="sm" onClick={handleApply}>
            <Check className="mr-1 h-3 w-3" />
            Use this
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    );
  }

  // preview or recording
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative overflow-hidden rounded-full"
        style={{ width: GIF_SIZE, height: GIF_SIZE }}
      >
        <video
          ref={videoRef}
          className="h-full w-full scale-x-[-1] object-cover"
          muted
          playsInline
        />
        {captureState === "recording" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white drop-shadow-lg">
              {countdown}
            </span>
          </div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={GIF_SIZE}
        height={GIF_SIZE}
        className="sr-only"
      />
      {captureState === "preview" && (
        <div className="flex gap-3">
          <Button onClick={startRecording}>
            <Square className="mr-2 h-4 w-4 fill-current" />
            Record {RECORD_DURATION_MS / 1000}s
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
      {captureState === "recording" && (
        <p className="text-sm text-muted-foreground">Recording…</p>
      )}
    </div>
  );
}
