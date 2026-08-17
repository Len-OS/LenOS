import * as React from "react";
import { Clock, Trash2 } from "lucide-react";
import { useIdentityQuery } from "@/shared/api/hooks";
import { signRelayEvent } from "@/shared/api/tauri";
import { relayClient } from "@/shared/api/relayClient";
import { KIND_DELETION } from "@/shared/constants/kinds";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useScheduledMessages } from "@/features/messages/lib/useScheduledMessages";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

function formatScheduledTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ScheduledMessagesPanel() {
  const identityQuery = useIdentityQuery();
  const pubkey = identityQuery.data?.pubkey ?? null;
  const channelsQuery = useChannelsQuery();
  const channels = channelsQuery.data ?? [];

  const [cancelling, setCancelling] = React.useState<string | null>(null);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

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
      const delEvent = await signRelayEvent({
        kind: KIND_DELETION,
        content: "",
        tags: [["e", id]],
      });
      await relayClient.publishEvent(
        delEvent,
        "Timed out cancelling scheduled message.",
        "Failed to cancel scheduled message.",
      );
    } catch (err) {
      setCancelError("Failed to cancel. Try again.");
      console.error("[ScheduledMessagesPanel] cancel failed:", err);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">Scheduled</span>
        {messages.length > 0 && (
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {messages.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {cancelError && (
          <p className="mb-3 text-xs text-destructive">{cancelError}</p>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                No scheduled messages
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
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
                  className={cn(
                    "group rounded-xl border border-border bg-card p-3",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground/70">
                      #{getChannelName(msg.channelId)}
                    </span>
                    <Button
                      aria-label="Cancel scheduled message"
                      className="h-auto p-1 opacity-0 group-hover:opacity-100"
                      disabled={cancelling === msg.id}
                      onClick={() => void handleCancel(msg.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground/70">
                    {msg.content}
                  </p>
                  <p className="mt-1.5 text-2xs text-muted-foreground/60">
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
