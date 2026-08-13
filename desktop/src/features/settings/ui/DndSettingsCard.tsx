import { useState } from "react";
import { useDnd } from "@/features/notifications/lib/useDnd";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { SettingsOptionGroup, SettingsOptionRow } from "./SettingsOptionGroup";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

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

export function DndSettingsCard({
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

  const handleToggle = (checked: boolean) => {
    if (checked) {
      void run(() => enable(null));
    } else {
      void run(disable);
    }
  };

  const handlePreset = (preset: { label: string; seconds: number | null }) => {
    const seconds =
      preset.label === "Until EOD" ? secondsUntilMidnight() : preset.seconds;
    void run(() => enable(seconds));
  };

  return (
    <section className="min-w-0" data-testid="settings-dnd">
      <SettingsSectionHeader
        title="Do Not Disturb"
        description="Silence all notifications for a set period."
      />

      <div className="flex flex-col gap-4">
        <SettingsOptionGroup>
          <SettingsOptionRow>
            <div className="min-w-0">
              <label className="text-sm font-medium" htmlFor="dnd-switch">
                Do Not Disturb
              </label>
              <p className="text-sm font-normal text-muted-foreground">
                {isDndActive
                  ? expiresAt !== null
                    ? `Active until ${formatExpiry(expiresAt)}`
                    : "Active indefinitely"
                  : "Mute all notifications temporarily."}
              </p>
            </div>
            <Switch
              checked={isDndActive}
              data-testid="dnd-toggle"
              disabled={busy || currentPubkey === null}
              id="dnd-switch"
              onCheckedChange={handleToggle}
            />
          </SettingsOptionRow>
        </SettingsOptionGroup>

        {!isDndActive && (
          <SettingsOptionGroup>
            <SettingsOptionRow>
              <span className="text-sm font-medium">Enable for</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    disabled={busy || currentPubkey === null}
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </SettingsOptionRow>
          </SettingsOptionGroup>
        )}

        {isDndActive && (
          <div className="flex justify-end">
            <Button
              disabled={busy || currentPubkey === null}
              onClick={() => void run(disable)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Turn off
            </Button>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
