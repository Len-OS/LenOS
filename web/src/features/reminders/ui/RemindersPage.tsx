import { useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useReminders } from "../useReminders";
import { useReminderNotifications } from "../useReminderNotifications";

function formatExpiry(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RemindersPage() {
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { reminders, isLoading } = useReminders(currentPubkey);

  useReminderNotifications(reminders);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  async function deleteReminder(reminderId: string) {
    setDeletingId(reminderId);
    try {
      const event = await signNostrEvent(
        { kind: 5, content: "", tags: [["e", reminderId]] },
        { requireDurableSigner: true },
      );
      const client = getRelayClient(relayWsUrl());
      client.publish(event);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <Bell className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">
          Reminders
        </span>
        {reminders.length > 0 && (
          <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
            {reminders.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-black/5 dark:bg-white/5"
              />
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Bell className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No upcoming reminders
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Set reminders on messages from the message menu.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="flex items-start gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
              >
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-black/80 dark:text-white/80">
                    {reminder.content || "(no preview)"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      {formatExpiry(reminder.expiry)}
                    </span>
                    {reminder.channelId && (
                      <Link
                        to="/channels/$channelId"
                        params={{ channelId: reminder.channelId }}
                        className="text-xs text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                      >
                        Go to channel →
                      </Link>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deletingId === reminder.id}
                  onClick={() => void deleteReminder(reminder.id)}
                  aria-label="Delete reminder"
                  className="shrink-0 rounded p-1 text-black/30 hover:bg-black/5 hover:text-red-500 dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
