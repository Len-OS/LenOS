import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useMessages } from "@/features/messages/use-messages";
import { useChannels } from "@/features/channels/use-channels";
import { useReactions } from "@/features/messages/use-reactions";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import { useReadState } from "@/features/channels/readState/useReadState";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";

export function ChannelView() {
  const { channelId } = useParams({
    from: "/_workspace/channels/$channelId",
  });
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const { messages, isLoading } = useMessages(channelId);
  const { markRead } = useReadState(channelId);
  const messageIds = messages.map((m) => m.id);
  const reactions = useReactions(channelId, messageIds);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);

  useEffect(() => {
    getCurrentPubkey().then(setCurrentPubkey).catch(() => {});
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last) markRead(last.createdAt);
  }, [messages, markRead]);

  const channel = channels.find((c) => c.id === channelId);
  const channelName = channel?.name ?? channelId;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          # {channelName}
        </span>
        {channel?.description && (
          <span className="ml-3 truncate text-sm text-black/50 dark:text-white/40">
            {channel.description}
          </span>
        )}
      </div>

      <MessageTimeline
        messages={messages}
        isLoading={isLoading}
        channelName={channelName}
        channelId={channelId}
        reactions={reactions}
        currentPubkey={currentPubkey}
      />

      <MessageComposer channelId={channelId} channelName={channelName} />
    </div>
  );
}
