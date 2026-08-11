import { useState } from "react";
import { MessageSquareText, PenSquare } from "lucide-react";
import { useForumPosts } from "../hooks";
import { ForumPostCard } from "./ForumPostCard";
import { ForumComposer } from "./ForumComposer";
import { ForumThreadPanel } from "./ForumThreadPanel";

interface Props {
  channelId: string;
  channelName: string;
  currentPubkey: string | null;
}

export function ForumView({
  channelId,
  channelName: _channelName,
  currentPubkey: _currentPubkey,
}: Props) {
  const { posts, isLoading } = useForumPosts(channelId);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-black/10 p-4 dark:border-white/10">
          {composerOpen ? (
            <ForumComposer
              channelId={channelId}
              onClose={() => setComposerOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-black/20 px-4 py-3 text-left text-sm text-black/40 transition-colors hover:border-black/30 hover:bg-black/[0.02] hover:text-black/60 dark:border-white/20 dark:text-white/40 dark:hover:border-white/30 dark:hover:bg-white/[0.03] dark:hover:text-white/60"
            >
              <PenSquare className="h-4 w-4 shrink-0" />
              Start a new post…
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 w-full animate-pulse rounded-xl bg-black/5 dark:bg-white/5"
                />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <MessageSquareText className="h-10 w-10 text-black/20 dark:text-white/20" />
              <div>
                <p className="text-sm font-medium text-black/50 dark:text-white/50">
                  No posts yet
                </p>
                <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                  Start a discussion by creating the first post.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <ForumPostCard
                  key={post.id}
                  post={post}
                  onClick={() => setSelectedPostId(post.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPostId && (
        <ForumThreadPanel
          channelId={channelId}
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
        />
      )}
    </div>
  );
}
