import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import { useForumThread } from "../hooks";
import { ForumComposer } from "./ForumComposer";

interface ReplyRowProps {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

function ReplyRow({ pubkey, content, createdAt }: ReplyRowProps) {
  const profile = useProfile(pubkey);
  const displayName = profile?.name || truncatePubkey(pubkey);
  return (
    <div className="flex items-start gap-3 py-3">
      <Avatar src={profile?.picture} name={displayName} size={28} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-black dark:text-white">
            {displayName}
          </span>
          <span className="text-xs text-black/40 dark:text-white/40">
            {relativeTime(createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-black/80 dark:text-white/80">
          {content}
        </p>
      </div>
    </div>
  );
}

interface Props {
  channelId: string;
  postId: string;
  onBack?: () => void;
}

export function ForumPostDetail({ channelId, postId, onBack }: Props) {
  const navigate = useNavigate();
  const { post, replies, isLoading } = useForumThread(channelId, postId);
  const authorProfile = useProfile(post?.pubkey ?? "");
  const [replyOpen, setReplyOpen] = useState(false);

  const authorName = authorProfile?.name || truncatePubkey(post?.pubkey ?? "");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <button
          type="button"
          onClick={() =>
            onBack
              ? onBack()
              : void navigate({ to: "/channels/$channelId", params: { channelId } })
          }
          aria-label="Back to forum"
          className="mr-3 rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="truncate font-semibold text-black dark:text-white">
          {post?.subject || "Post"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && !post ? (
          <div className="space-y-3">
            <div className="h-32 w-full animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
          </div>
        ) : post ? (
          <>
            <div className="mb-6 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
              {post.subject && (
                <h1 className="mb-3 text-lg font-semibold text-black dark:text-white">
                  {post.subject}
                </h1>
              )}
              <div className="mb-3 flex items-center gap-2">
                <Avatar
                  src={authorProfile?.picture}
                  name={authorName}
                  size={24}
                />
                <span className="text-sm font-medium text-black/70 dark:text-white/70">
                  {authorName}
                </span>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {relativeTime(post.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-black/80 dark:text-white/80">
                {post.content}
              </p>
            </div>

            {replies.length > 0 && (
              <div className="mb-4 divide-y divide-black/5 dark:divide-white/5">
                {replies.map((reply) => (
                  <ReplyRow
                    key={reply.id}
                    id={reply.id}
                    pubkey={reply.pubkey}
                    content={reply.content}
                    createdAt={reply.createdAt}
                  />
                ))}
              </div>
            )}

            {replyOpen ? (
              <ForumComposer
                channelId={channelId}
                onClose={() => setReplyOpen(false)}
                isReply
                parentEventId={postId}
              />
            ) : (
              <button
                type="button"
                onClick={() => setReplyOpen(true)}
                className="w-full rounded-lg border border-dashed border-black/20 px-4 py-2.5 text-left text-sm text-black/40 hover:border-black/30 hover:bg-black/[0.02] hover:text-black/60 dark:border-white/20 dark:text-white/40 dark:hover:border-white/30 dark:hover:bg-white/[0.03] dark:hover:text-white/60"
              >
                Write a reply…
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-black/40 dark:text-white/40">
            Post not found.
          </p>
        )}
      </div>
    </div>
  );
}
