import { useParams } from "@tanstack/react-router";
import { useMessages } from "@/features/messages/use-messages";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";

export function ChannelView() {
  const { channelId } = useParams({
    from: "/_workspace/channels/$channelId",
  });
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const { messages, isLoading } = useMessages(channelId);

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
      />

      <MessageComposer channelId={channelId} channelName={channelName} />
    </div>
  );
}
