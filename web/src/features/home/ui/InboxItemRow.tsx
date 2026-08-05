import { AtSign, MessageSquare, CornerDownRight } from "lucide-react";
import type { InboxItem } from "../useHomeInbox";
import type { Channel } from "@/features/channels/use-channels";
import { useProfile } from "@/features/profiles/use-profile";

interface Props {
  item: InboxItem;
  channels: Channel[];
  onClick: () => void;
}

const TYPE_ICON = {
  mention: AtSign,
  dm: MessageSquare,
  thread_reply: CornerDownRight,
} as const;

const TYPE_LABEL = {
  mention: "mentioned you",
  dm: "sent you a DM",
  thread_reply: "replied to your message",
} as const;

function relativeTime(unix: number): string {
  const diffSec = Math.floor(Date.now() / 1000) - unix;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function InboxItemRow({ item, channels, onClick }: Props) {
  const profile = useProfile(item.from);
  const authorName = profile?.name ?? item.from.slice(0, 8);
  const channel = channels.find((c) => c.id === item.channelId);
  const Icon = TYPE_ICON[item.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5",
        !item.isRead ? "bg-blue-50/50 dark:bg-blue-900/10" : "",
      ].join(" ")}
    >
      <div className="mt-0.5 shrink-0 rounded-full bg-black/5 p-1.5 dark:bg-white/5">
        <Icon className="h-3.5 w-3.5 text-black/50 dark:text-white/50" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-black dark:text-white">
            {authorName}
          </span>
          <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
            {TYPE_LABEL[item.type]}
          </span>
          {channel && (
            <span className="shrink-0 text-xs text-black/30 dark:text-white/30">
              in #{channel.name}
            </span>
          )}
          <span className="ml-auto shrink-0 text-xs text-black/30 dark:text-white/30">
            {relativeTime(item.createdAt)}
          </span>
          {!item.isRead && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-black/60 dark:text-white/60">
          {item.content}
        </p>
      </div>
    </button>
  );
}
