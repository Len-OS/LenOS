import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HuddleAudioSettings, HuddleAudioQuality } from "../HuddleContext";

interface HuddleQualityPopoverProps {
  onSettingsChange: (settings: HuddleAudioSettings) => void;
}

const QUALITY_OPTIONS: { value: HuddleAudioQuality; label: string }[] = [
  { value: "low", label: "Low (32 kbps)" },
  { value: "medium", label: "Medium (64 kbps)" },
  { value: "high", label: "High (128 kbps)" },
];

function readSettings(): HuddleAudioSettings {
  return {
    noiseSuppression:
      localStorage.getItem("huddle_noise_suppression") !== "false",
    quality:
      (localStorage.getItem("huddle_audio_quality") as HuddleAudioQuality) ??
      "high",
  };
}

export function HuddleQualityPopover({
  onSettingsChange,
}: HuddleQualityPopoverProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<HuddleAudioSettings>(readSettings);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  function applyQuality(quality: HuddleAudioQuality) {
    const next: HuddleAudioSettings = { ...settings, quality };
    localStorage.setItem("huddle_audio_quality", quality);
    setSettings(next);
    onSettingsChange(next);
  }

  function applyNoiseSuppression(noiseSuppression: boolean) {
    const next: HuddleAudioSettings = { ...settings, noiseSuppression };
    localStorage.setItem("huddle_noise_suppression", String(noiseSuppression));
    setSettings(next);
    onSettingsChange(next);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Audio quality settings"
        aria-expanded={open}
        className={
          "rounded-full p-2 transition-colors " +
          (open
            ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
            : "text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white")
        }
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 mb-2 w-52 -translate-x-1/2 rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
          <div className="space-y-3 p-3">
            <div>
              <p className="mb-2 text-xs font-medium text-black/70 dark:text-white/70">
                Audio Quality
              </p>
              <div className="space-y-1">
                {QUALITY_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <input
                      type="radio"
                      name="huddle_quality"
                      value={value}
                      checked={settings.quality === value}
                      onChange={() => applyQuality(value)}
                      className="accent-current"
                    />
                    <span className="text-xs text-black/80 dark:text-white/80">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-black/10 pt-3 dark:border-white/10">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-xs font-medium text-black/70 dark:text-white/70">
                  Noise Suppression
                </span>
                <input
                  type="checkbox"
                  checked={settings.noiseSuppression}
                  onChange={(e) => applyNoiseSuppression(e.target.checked)}
                  className="h-4 w-4 accent-current"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
