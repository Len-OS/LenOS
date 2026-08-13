import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type * as React from "react";
import { useHuddle } from "../HuddleContext";

const dragRegion = {
  WebkitAppRegion: "drag",
} as unknown as React.CSSProperties;

const noDragRegion = {
  WebkitAppRegion: "no-drag",
  cursor: "pointer",
  background: "rgba(255,255,255,0.12)",
  border: "none",
  color: "#fff",
  borderRadius: "6px",
  padding: "4px 8px",
  fontSize: 13,
} as unknown as React.CSSProperties;

export function HuddleBarPip() {
  const { leaveHuddle, isMuted, toggleMute } = useHuddle();

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    void getCurrentWebviewWindow().startDragging();
  }

  async function handleExpand() {
    await invoke("pop_in_huddle");
  }

  async function handleLeave() {
    await leaveHuddle();
    await invoke("pop_in_huddle");
  }

  return (
    <div
      style={{
        ...dragRegion,
        width: "280px",
        height: "80px",
        background: "rgba(20,20,20,0.95)",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: "8px",
        userSelect: "none",
      }}
      onMouseDown={handleDragStart}
    >
      <span style={{ color: "#fff", fontSize: 13, flex: 1 }}>
        Huddle active
      </span>
      <button
        style={noDragRegion}
        onClick={toggleMute}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>
      <button
        style={noDragRegion}
        onClick={() => void handleExpand()}
        title="Expand"
      >
        ⬆
      </button>
      <button
        style={noDragRegion}
        onClick={() => void handleLeave()}
        title="Leave"
      >
        ✕
      </button>
    </div>
  );
}
