import { useEffect, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_DELETION } from "@/shared/constants/kinds";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useScheduledMessages } from "@/features/messages/lib/useScheduledMessages";

function formatScheduledTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ScheduledMessagesPanel() {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPubkey()
      .then(setPubkey)
      .catch(() => {});
  }, []);

  const messages = useScheduledMessages(pubkey);

  function getChannelName(channelId: string): string {
    return (
      channels.find((c) => c.id === channelId)?.name ?? channelId.slice(0, 12)
    );
  }

  async function handleCancel(id: string) {
    setCancelling(id);
    setCancelError(null);
    try {
      const delEvent = await signNostrEvent(
        {
          kind: KIND_DELETION,
          content: "",
          tags: [["e", id]],
        },
        { requireNip07: false },
      );
      await getRelayClient(relayWsUrl()).publishAndWait(
        delEvent as Record<string, unknown>,
      );
    } catch (err) {
      setCancelError("Failed to cancel. Try again.");
      console.error("[ScheduledMessagesPanel] cancel failed:", err);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <Clock className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">
          Scheduled
        </span>
        {messages.length > 0 && (
          <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
            {messages.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {cancelError && (
          <p className="mb-3 text-xs text-red-500">{cancelError}</p>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Clock className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No scheduled messages
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Use the clock icon in the composer to schedule a message.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {[...messages]
              .sort((a, b) => a.notBefore - b.notBefore)
              .map((msg) => (
                <div
                  key={msg.id}
                  className="group rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-black/50 dark:text-white/50">
                      <span className="font-medium text-black/70 dark:text-white/70">
                        #{getChannelName(msg.channelId)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCancel(msg.id)}
                      disabled={cancelling === msg.id}
                      aria-label="Cancel scheduled message"
                      className="rounded p-1 text-black/40 opacity-0 hover:bg-black/5 hover:text-red-500 disabled:opacity-30 group-hover:opacity-100 dark:text-white/40 dark:hover:bg-white/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
                    {msg.content}
                  </p>
                  <p className="mt-1.5 text-[11px] text-black/30 dark:text-white/30">
                    Sends {formatScheduledTime(msg.notBefore)}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
