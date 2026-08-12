import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useHuddle } from "../HuddleContext";

export function HuddleFloatingBar() {
  const { leaveHuddle, muted, setMuted, parentChannelId, isFloating } =
    useHuddle();
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  if (!isFloating) return null;

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }

  function handlePointerUp() {
    dragStart.current = null;
  }

  function handleExpand() {
    if (parentChannelId) {
      void navigate({
        to: "/channels/$channelId",
        params: { channelId: parentChannelId },
      });
    }
  }

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "fixed",
        bottom: `${16 - offset.y}px`,
        right: `${16 - offset.x}px`,
        zIndex: 50,
        width: "260px",
        background: "rgba(20,20,20,0.95)",
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        padding: "10px 14px",
        gap: "8px",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <span style={{ color: "#fff", fontSize: 13, flex: 1 }}>
        Huddle active
      </span>
      <button
        onClick={() => setMuted(!muted)}
        style={{ cursor: "pointer" }}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        onClick={handleExpand}
        style={{ cursor: "pointer" }}
        title="Go to channel"
      >
        ⬆
      </button>
      <button
        onClick={() => void leaveHuddle()}
        style={{ cursor: "pointer" }}
        title="Leave"
      >
        ✕
      </button>
    </div>
  );
}
