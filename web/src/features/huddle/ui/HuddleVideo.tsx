import { useEffect, useRef } from "react";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { HuddleVideoWs } from "../lib/huddleVideoWs";

const VIDEO_HDR = 14;

interface Props {
  ephemeralChannelId: string;
  screenShareActive: boolean;
  remotePresenterPubkey: string | null;
  onPresenterChange: (pubkey: string | null) => void;
}

export function HuddleVideo({
  ephemeralChannelId,
  screenShareActive,
  remotePresenterPubkey,
  onPresenterChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const fragmentBufRef = useRef<Uint8Array[]>([]);

  useEffect(() => {
    if (typeof VideoDecoder === "undefined") return;

    const decoder = new VideoDecoder({
      output: (frame) => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(frame, 0, 0);
        }
        frame.close();
      },
      error: (e) => console.error("[HuddleVideo]", e),
    });
    decoder.configure({ codec: "vp8" });
    decoderRef.current = decoder;

    return () => {
      decoder.close();
      decoderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ws = new HuddleVideoWs({
      wsUrl: relayWsUrl(),
      ephemeralChannelId,
      onPresenter: (pubkey) => onPresenterChange(pubkey),
      onPresenterLeft: () => onPresenterChange(null),
      onFrame: (data) => {
        const buf = new Uint8Array(data);
        if (buf.byteLength <= VIDEO_HDR) return;
        const flags = buf[10];
        const isLast = (flags & 0x02) !== 0;
        fragmentBufRef.current.push(buf.slice(VIDEO_HDR));
        if (!isLast) return;

        const total = fragmentBufRef.current.reduce(
          (acc, b) => acc + b.byteLength,
          0,
        );
        const assembled = new Uint8Array(total);
        let offset = 0;
        for (const frag of fragmentBufRef.current) {
          assembled.set(frag, offset);
          offset += frag.byteLength;
        }
        fragmentBufRef.current = [];

        const isKeyFrame = (flags & 0x01) !== 0;
        const decoder = decoderRef.current;
        if (!decoder || decoder.state === "closed") return;
        try {
          const v = new DataView(buf.buffer, buf.byteOffset, VIDEO_HDR);
          const ts = (Number(v.getBigUint64(2, false)) * 1000) / 90;
          decoder.decode(
            new EncodedVideoChunk({
              type: isKeyFrame ? "key" : "delta",
              timestamp: ts,
              data: assembled,
            }),
          );
        } catch {
          // silently drop malformed frames
        }
      },
    });

    void ws.connect().catch(() => {});
    return () => ws.close();
  }, [ephemeralChannelId, onPresenterChange]);

  const hasPresenter = remotePresenterPubkey !== null || screenShareActive;

  return (
    <div className="flex flex-col items-center justify-center border-b border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
      {hasPresenter ? (
        <canvas
          ref={canvasRef}
          className="max-h-64 max-w-full rounded-lg object-contain"
        />
      ) : (
        <p className="text-sm text-black/40 dark:text-white/40">
          No screen share active
        </p>
      )}
    </div>
  );
}
