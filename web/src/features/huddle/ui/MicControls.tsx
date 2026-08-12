import { Mic, MicOff } from "lucide-react";
import { useHuddle } from "../HuddleContext";

const canSetSinkId =
  typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;

export function MicControls() {
  const {
    muted,
    setMuted,
    micLevel,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    setOutputDeviceId,
  } = useHuddle();

  const inputDevices = audioDevices.filter((d) => d.kind === "audioinput");
  const outputDevices = audioDevices.filter((d) => d.kind === "audiooutput");

  return (
    <div className="flex items-center gap-1">
      <div className="flex h-5 w-10 items-end gap-px overflow-hidden rounded">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-75"
            style={{
              backgroundColor:
                micLevel > i / 8
                  ? micLevel > 0.7
                    ? "#ef4444"
                    : micLevel > 0.4
                      ? "#f59e0b"
                      : "#22c55e"
                  : "currentColor",
              opacity: micLevel > i / 8 ? 1 : 0.15,
              height: (i + 1) * 12.5 + "%",
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        className={
          "rounded-full p-2 transition-colors " +
          (muted
            ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
            : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
        }
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      {inputDevices.length > 1 && (
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          aria-label="Select microphone"
          className="max-w-[120px] truncate rounded border border-black/10 bg-transparent px-1 py-0.5 text-xs text-black/60 dark:border-white/10 dark:text-white/60"
        >
          <option value="">System default</option>
          {inputDevices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      {canSetSinkId && outputDevices.length > 1 && (
        <select
          defaultValue=""
          onChange={(e) => setOutputDeviceId(e.target.value)}
          aria-label="Select speaker"
          className="max-w-[120px] truncate rounded border border-black/10 bg-transparent px-1 py-0.5 text-xs text-black/60 dark:border-white/10 dark:text-white/60"
        >
          <option value="">System default</option>
          {outputDevices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker ${i + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
