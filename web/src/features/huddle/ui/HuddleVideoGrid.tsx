import { useEffect, useRef, useState } from "react";
import { onVideoFrame, type VideoFramePayload } from "../lib/huddleVideoWs";

interface HuddleVideoGridProps {
  publishers: Map<string, "camera" | "screen">;
  localStream: MediaStream | null;
}

interface TileState {
  canvas: HTMLCanvasElement;
  decoder: VideoDecoder;
}

export function HuddleVideoGrid({
  publishers,
  localStream,
}: HuddleVideoGridProps) {
  const tilesRef = useRef<Map<string, TileState>>(new Map());
  const [, forceRender] = useState(0);

  // Sync decoders to publisher map
  useEffect(() => {
    const tiles = tilesRef.current;
    const newKeys = new Set(publishers.keys());

    // Remove stale tiles
    for (const [pk, tile] of tiles) {
      if (!newKeys.has(pk)) {
        try {
          tile.decoder.close();
        } catch {
          /* already closed */
        }
        tile.canvas.remove();
        tiles.delete(pk);
      }
    }

    // Create tiles for new publishers
    for (const pk of newKeys) {
      if (!tiles.has(pk)) {
        const canvas = document.createElement("canvas");
        canvas.className = "huddle-video-tile-canvas";
        const decoder = new VideoDecoder({
          output: (frame) => {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(frame, 0, 0);
            frame.close();
          },
          error: (e) => console.error("[HuddleVideoGrid] decoder:", e),
        });
        decoder.configure({ codec: "vp8" });
        tiles.set(pk, { canvas, decoder });
      }
    }

    forceRender((n) => n + 1);
  }, [publishers]);

  // Frame bus subscription
  useEffect(() => {
    const unsub = onVideoFrame((frame: VideoFramePayload) => {
      const tile = tilesRef.current.get(frame.senderPubkey);
      if (!tile || tile.decoder.state === "closed") return;
      const isKey = (frame.flags & 0x01) !== 0;
      tile.decoder.decode(
        new EncodedVideoChunk({
          type: isKey ? "key" : "delta",
          timestamp: frame.pts_us,
          data: frame.data,
        }),
      );
    });
    return unsub;
  }, []);

  const publisherArray = Array.from(publishers.entries());
  const screenPks = publisherArray
    .filter(([, mode]) => mode === "screen")
    .map(([pk]) => pk);
  const cameraPks = publisherArray
    .filter(([, mode]) => mode === "camera")
    .map(([pk]) => pk);

  const totalRemote = publishers.size;
  if (totalRemote === 0 && !localStream) return null;

  const gridClass =
    totalRemote === 0
      ? "huddle-grid-1"
      : totalRemote === 1
        ? "huddle-grid-1"
        : totalRemote === 2
          ? "huddle-grid-2"
          : totalRemote <= 4
            ? "huddle-grid-4"
            : "huddle-grid-many";

  return (
    <div className={`huddle-video-grid ${gridClass}`}>
      {screenPks.map((pk) => {
        const tile = tilesRef.current.get(pk);
        return tile ? (
          <div key={pk} className="huddle-tile huddle-tile-screen">
            <CanvasTile canvas={tile.canvas} />
          </div>
        ) : null;
      })}
      {cameraPks.map((pk) => {
        const tile = tilesRef.current.get(pk);
        return tile ? (
          <div key={pk} className="huddle-tile huddle-tile-camera">
            <CanvasTile canvas={tile.canvas} />
          </div>
        ) : null;
      })}
      {localStream && (
        <div className="huddle-tile huddle-tile-local">
          <LocalVideoPreview stream={localStream} />
        </div>
      )}
    </div>
  );
}

function CanvasTile({ canvas }: { canvas: HTMLCanvasElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";
    el.appendChild(canvas);
    return () => {
      canvas.remove();
    };
  }, [canvas]);
  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

function LocalVideoPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
