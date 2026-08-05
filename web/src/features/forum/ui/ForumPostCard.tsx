import { MessageSquare } from "lucide-react";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { ForumPost } from "../hooks";

interface Props {
  post: ForumPost;
  onClick: () => void;
}

export function ForumPostCard({ post, onClick }: Props) {
  const profile = useProfile(post.pubkey);
  const displayName = profile?.name || truncatePubkey(post.pubkey);
  const preview = post.content.length > 200 ? `${post.content.slice(0, 200)}…` : post.content;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-black/10 bg-white p-4 text-left transition-colors hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
    >
      {post.subject && (
        <p className="mb-1.5 font-semibold text-black dark:text-white">
          {post.subject}
        </p>
      )}
      <p className="mb-3 line-clamp-3 text-sm text-black/70 dark:text-white/70">
        {preview}
      </p>
      <div className="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
        <Avatar src={profile?.picture} name={displayName} size={20} />
        <span className="font-medium text-black/60 dark:text-white/60">
          {displayName}
        </span>
        <span>·</span>
        <span>{relativeTime(post.createdAt)}</span>
        {post.replyCount > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {post.replyCount}
          </span>
        )}
      </div>
    </button>
  );
}
