import { useState } from "react";
import { Bell, X } from "lucide-react";
import { signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_REMINDER } from "@/shared/constants/kinds";

interface Props {
  messageId: string;
  channelId: string;
  content: string;
  onClose: () => void;
}

function nextDay(hour = 9): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function nextWeek(hour = 9): number {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(hour, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

const PRESETS = [
  { label: "20 minutes", expiry: () => Math.floor(Date.now() / 1000) + 20 * 60 },
  { label: "1 hour", expiry: () => Math.floor(Date.now() / 1000) + 3600 },
  { label: "Tomorrow", expiry: () => nextDay() },
  { label: "Next week", expiry: () => nextWeek() },
] as const;

export function SetReminderPopover({ messageId, channelId, content, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [customDate, setCustomDate] = useState("");

  async function saveReminder(expiry: number) {
    setSaving(true);
    try {
      const event = await signNostrEvent(
        {
          kind: KIND_REMINDER,
          content,
          tags: [
            ["e", messageId],
            ["h", channelId],
            ["expiration", String(expiry)],
          ],
        },
        { requireNip07: true },
      );
      const client = getRelayClient(relayWsUrl());
      client.publish(event);
      onClose();
    } catch {
      setSaving(false);
    }
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customDate) return;
    const expiry = Math.floor(new Date(customDate).getTime() / 1000);
    if (expiry > Math.floor(Date.now() / 1000)) {
      void saveReminder(expiry);
    }
  }

  return (
    <div className="w-56 rounded-xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-black dark:text-white">
          <Bell className="h-3.5 w-3.5" />
          Set Reminder
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-0.5 text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={saving}
            onClick={() => void saveReminder(preset.expiry())}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-2 border-t border-black/10 pt-2 dark:border-white/10">
        <form onSubmit={handleCustomSubmit} className="flex flex-col gap-1.5">
          <input
            type="datetime-local"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs text-black dark:border-white/10 dark:text-white"
          />
          <button
            type="submit"
            disabled={!customDate || saving}
            className="w-full rounded-md bg-black/5 px-2 py-1 text-xs font-medium text-black/70 hover:bg-black/10 disabled:opacity-40 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            Set custom time
          </button>
        </form>
      </div>
    </div>
  );
}
