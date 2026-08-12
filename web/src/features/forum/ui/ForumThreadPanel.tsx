import { X } from "lucide-react";
import { ForumPostDetail } from "./ForumPostDetail";

interface Props {
  channelId: string;
  postId: string;
  onClose: () => void;
}

export function ForumThreadPanel({ channelId, postId, onClose }: Props) {
  return (
    <div className="flex w-[420px] shrink-0 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">Thread</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread panel"
          className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ForumPostDetail
          channelId={channelId}
          postId={postId}
          onBack={onClose}
        />
      </div>
    </div>
  );
}
