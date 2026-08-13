import { useState, useRef, useEffect } from "react";
import type { Message } from "@/features/messages/use-messages";
import { ReportDialog } from "@/features/moderation/ui/ReportDialog";
import { SetReminderPopover } from "@/features/reminders/ui/SetReminderPopover";

interface Props {
  msg: Message;
  channelId: string;
  currentPubkey: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
  onSave?: () => void;
  onBookmark?: () => void;
}

export function MessageContextMenu({
  msg,
  channelId,
  currentPubkey,
  onEdit,
  onDelete,
  onReply,
  onSave,
  onBookmark,
}: Props) {
  const isOwn = currentPubkey !== null && msg.pubkey === currentPubkey;
  const [reportOpen, setReportOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const reminderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reminderOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        reminderRef.current &&
        !reminderRef.current.contains(e.target as Node)
      ) {
        setReminderOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [reminderOpen]);

  return (
    <>
      <div className="absolute right-2 top-0 hidden rounded-md border border-black/10 bg-white shadow-sm group-hover:flex dark:border-white/10 dark:bg-[#2a2a2a]">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(msg.content)}
          className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
        >
          Copy
        </button>
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Reply
          </button>
        )}
        <button
          type="button"
          onClick={() => setReminderOpen((v) => !v)}
          className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
        >
          Remind
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Save
          </button>
        )}
        {onBookmark && (
          <button
            type="button"
            onClick={onBookmark}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Bookmark
          </button>
        )}
        {isOwn && (
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
          >
            Edit
          </button>
        )}
        {isOwn && (
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/5"
          >
            Delete
          </button>
        )}
        {!isOwn && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="px-2 py-1 text-xs text-red-500 hover:bg-red-500/5"
          >
            Report
          </button>
        )}
      </div>
      {reminderOpen && (
        <div ref={reminderRef} className="absolute right-2 top-7 z-50">
          <SetReminderPopover
            messageId={msg.id}
            channelId={channelId}
            content={msg.content}
            onClose={() => setReminderOpen(false)}
          />
        </div>
      )}
      <ReportDialog
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetEventId={msg.id}
        targetPubkey={msg.pubkey}
      />
    </>
  );
}
