import { useState } from "react";
import { FileText, Send, Trash2, Edit2, Check, X } from "lucide-react";
import { useDrafts } from "@/features/messages/useDrafts";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { relativeTime } from "@/shared/lib/relative-time";

function ConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-[#1e1e1e]">
      <p className="flex-1 text-xs text-black/70 dark:text-white/70">
        Send this draft?
      </p>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded bg-black px-2 py-1 text-xs font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
      >
        Send
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-black/15 px-2 py-1 text-xs text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60"
      >
        Cancel
      </button>
    </div>
  );
}

export function DraftsPanel() {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const { drafts, updateDraft, deleteDraft, sendDraft } = useDrafts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  function getChannelName(channelId: string): string {
    return (
      channels.find((c) => c.id === channelId)?.name ?? channelId.slice(0, 12)
    );
  }

  function startEdit(id: string, content: string) {
    setEditingId(id);
    setEditContent(content);
    setConfirmSendId(null);
  }

  function saveEdit(id: string) {
    updateDraft(id, editContent);
    setEditingId(null);
  }

  async function handleSend(id: string) {
    setSendingId(id);
    setSendError(null);
    try {
      await sendDraft(id);
      setConfirmSendId(null);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Failed to send.");
    }
    setSendingId(null);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <FileText className="mr-2 h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">Drafts</span>
        {drafts.length > 0 && (
          <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
            {drafts.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileText className="h-10 w-10 text-black/20 dark:text-white/20" />
            <div>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">
                No drafts
              </p>
              <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                Drafts you save will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sendError && <p className="text-xs text-red-500">{sendError}</p>}
            {[...drafts]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((draft) => {
                const isEditing = editingId === draft.id;
                const isConfirming = confirmSendId === draft.id;
                const isSending = sendingId === draft.id;
                const isThread = Boolean(draft.threadRootId);

                return (
                  <div
                    key={draft.id}
                    className="group rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-black/50 dark:text-white/50">
                        <span className="font-medium text-black/70 dark:text-white/70">
                          #{getChannelName(draft.channelId)}
                        </span>
                        {isThread && (
                          <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                            thread reply
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(draft.id, draft.content)}
                              aria-label="Edit draft"
                              className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmSendId(draft.id)}
                              aria-label="Send draft"
                              disabled={isSending}
                              className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-blue-600 disabled:opacity-40 dark:text-white/40 dark:hover:bg-white/5"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDraft(draft.id)}
                              aria-label="Delete draft"
                              className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-red-500 dark:text-white/40 dark:hover:bg-white/5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(draft.id)}
                              aria-label="Save edit"
                              className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-green-600 dark:text-white/40 dark:hover:bg-white/5"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel edit"
                              className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-black outline-none placeholder:text-black/30 focus:border-black/30 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                      />
                    ) : (
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
                        {draft.content}
                      </p>
                    )}

                    <p className="mt-1.5 text-[11px] text-black/30 dark:text-white/30">
                      {relativeTime(draft.createdAt)}
                    </p>

                    {isConfirming && (
                      <ConfirmDialog
                        onConfirm={() => void handleSend(draft.id)}
                        onCancel={() => setConfirmSendId(null)}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
