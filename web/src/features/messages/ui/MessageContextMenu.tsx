import type { Message } from "@/features/messages/use-messages";

interface Props {
  msg: Message;
  currentPubkey: string | null;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageContextMenu({
  msg,
  currentPubkey,
  onEdit,
  onDelete,
}: Props) {
  const isOwn = currentPubkey !== null && msg.pubkey === currentPubkey;

  return (
    <div className="absolute right-2 top-0 hidden rounded-md border border-black/10 bg-white shadow-sm group-hover:flex dark:border-white/10 dark:bg-[#2a2a2a]">
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(msg.content)}
        className="px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
      >
        Copy
      </button>
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
    </div>
  );
}
