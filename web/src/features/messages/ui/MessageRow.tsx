import { useState, type KeyboardEvent } from "react";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Message } from "@/features/messages/use-messages";
import type { Reaction } from "@/features/messages/use-reactions";
import { MessageReactions } from "@/features/messages/ui/MessageReactions";
import { MessageContextMenu } from "@/features/messages/ui/MessageContextMenu";
import { useMessageActions } from "@/features/messages/useMessageActions";

interface Props {
  msg: Message;
  isGrouped: boolean;
  channelId: string;
  reactions: Reaction[];
  currentPubkey: string | null;
}

export function MessageRow({
  msg,
  isGrouped,
  channelId,
  reactions,
  currentPubkey,
}: Props) {
  const profile = useProfile(msg.pubkey);
  const displayName = profile?.name || truncatePubkey(msg.pubkey);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const { deleteMessage, editMessage } = useMessageActions();

  const submitEdit = async () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== msg.content) {
      await editMessage(msg.id, channelId, trimmed).catch(() => {});
    }
    setEditing(false);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitEdit();
    }
    if (e.key === "Escape") {
      setEditText(msg.content);
      setEditing(false);
    }
  };

  const handleDelete = () => {
    void deleteMessage(msg.id, channelId).catch(() => {});
  };

  return (
    <div
      className={[
        "group relative",
        isGrouped ? "pl-[44px]" : "mt-4 flex items-start gap-2.5",
      ].join(" ")}
    >
      {!isGrouped && (
        <Avatar src={profile?.picture} name={displayName} size={32} />
      )}
      <div className={isGrouped ? "" : "min-w-0 flex-1"}>
        {!isGrouped && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-black dark:text-white">
              {displayName}
            </span>
            <span className="text-xs text-black/40 dark:text-white/40">
              {relativeTime(msg.createdAt)}
            </span>
          </div>
        )}
        {editing ? (
          <textarea
            // biome-ignore lint/a11y/noAutofocus: focus is intentional when entering edit mode
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={() => void submitEdit()}
            rows={Math.max(1, editText.split("\n").length)}
            className="w-full resize-none rounded border border-black/20 bg-white px-2 py-1 text-sm text-black outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-black/90 dark:text-white/85">
            {msg.content}
          </p>
        )}
        <MessageReactions
          messageId={msg.id}
          channelId={channelId}
          reactions={reactions}
          currentPubkey={currentPubkey}
        />
      </div>
      {!editing && (
        <MessageContextMenu
          msg={msg}
          currentPubkey={currentPubkey}
          onEdit={() => {
            setEditText(msg.content);
            setEditing(true);
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
