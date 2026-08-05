import { Hash, MessageSquare, MessageSquareText } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Channel } from "@/features/channels/use-channels";
import {
  KIND_FORUM_COMMENT,
  KIND_FORUM_POST,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { PulseItem } from "../usePulseFeed";

function kindLabel(kind: number): { label: string; icon: React.ReactNode } {
  if (kind === KIND_FORUM_POST)
    return {
      label: "Forum post",
      icon: <MessageSquareText className="h-3.5 w-3.5" />,
    };
  if (kind === KIND_FORUM_COMMENT)
    return { label: "Reply", icon: <MessageSquare className="h-3.5 w-3.5" /> };
  if (kind === KIND_STREAM_MESSAGE || kind === KIND_STREAM_MESSAGE_V2)
    return { label: "Message", icon: <Hash className="h-3.5 w-3.5" /> };
  return { label: "Activity", icon: <Hash className="h-3.5 w-3.5" /> };
}

interface Props {
  item: PulseItem;
  channels: Channel[];
}

export function ActivityCard({ item, channels }: Props) {
  const navigate = useNavigate();
  const profile = useProfile(item.pubkey);
  const displayName = profile?.name || truncatePubkey(item.pubkey);
  const channel = channels.find((c) => c.id === item.channelId);
  const preview =
    item.content.length > 120 ? `${item.content.slice(0, 120)}…` : item.content;
  const { label, icon } = kindLabel(item.kind);

  return (
    <button
      type="button"
      onClick={() =>
        void navigate({
          to: "/channels/$channelId",
          params: { channelId: item.channelId },
        })
      }
      className="flex w-full items-start gap-3 rounded-xl border border-black/10 bg-white p-3 text-left transition-colors hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
    >
      <Avatar src={profile?.picture} name={displayName} size={32} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
          <span className="flex items-center gap-1">
            {icon}
            {label}
          </span>
          {channel && (
            <>
              <span>in</span>
              <span className="font-medium text-black/60 dark:text-white/60">
                #{channel.name}
              </span>
            </>
          )}
          <span className="ml-auto shrink-0">
            {relativeTime(item.createdAt)}
          </span>
        </div>
        <p className="text-sm font-medium text-black dark:text-white">
          {displayName}
        </p>
        {preview && (
          <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">
            {preview}
          </p>
        )}
      </div>
    </button>
  );
}
