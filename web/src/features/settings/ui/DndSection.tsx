import { useState } from "react";
import { useDnd } from "@/features/notifications/lib/useDnd";

const PRESETS: { label: string; seconds: number | null }[] = [
  { label: "30 min", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
  { label: "Until EOD", seconds: null },
  { label: "Indefinite", seconds: null },
];

function secondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DndSection({
  currentPubkey,
}: {
  currentPubkey: string | null;
}) {
  const { isDndActive, expiresAt, enable, disable } = useDnd(currentPubkey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handlePreset = (preset: { label: string; seconds: number | null }) => {
    const seconds =
      preset.label === "Until EOD" ? secondsUntilMidnight() : preset.seconds;
    void run(() => enable(seconds));
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15">
        <div>
          <p className="text-sm font-medium text-black dark:text-white">
            Do Not Disturb
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {isDndActive
              ? expiresAt !== null
                ? `Active until ${formatExpiry(expiresAt)}`
                : "Active indefinitely"
              : "Silence all notifications temporarily."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDndActive}
          disabled={busy || currentPubkey === null}
          onClick={() => void run(isDndActive ? disable : () => enable(null))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${
            isDndActive
              ? "bg-black dark:bg-white"
              : "bg-black/20 dark:bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform dark:bg-black ${
              isDndActive ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {!isDndActive && (
        <div>
          <p className="mb-2 text-xs text-black/50 dark:text-white/50">
            Enable for
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={busy || currentPubkey === null}
                onClick={() => handlePreset(preset)}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isDndActive && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || currentPubkey === null}
            onClick={() => void run(disable)}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/5"
          >
            Turn off
          </button>
        </div>
      )}

      {error !== null && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
