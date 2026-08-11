import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { KIND_TEXT_NOTE } from "@/shared/constants/kinds";

interface Note {
  id: string;
  content: string;
  createdAt: number;
}

interface Props {
  pubkey: string | null;
}

function relativeTime(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RecentNotesSection({ pubkey }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey) return;
    setLoading(true);
    queryEvents(relayWsUrl(), {
      kinds: [KIND_TEXT_NOTE],
      authors: [pubkey],
      limit: 20,
    })
      .then((events) => {
        const parsed: Note[] = events
          .map((e) => ({
            id: (e.id as string) ?? "",
            content: (e.content as string) ?? "",
            createdAt: (e.created_at as number) ?? 0,
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setNotes(parsed);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pubkey]);

  if (!pubkey) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileText className="h-10 w-10 text-black/20 dark:text-white/20" />
        <p className="text-sm font-medium text-black/50 dark:text-white/50">
          Not signed in
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-black/40 dark:text-white/40">Loading…</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileText className="h-10 w-10 text-black/20 dark:text-white/20" />
        <div>
          <p className="text-sm font-medium text-black/50 dark:text-white/50">
            No notes yet
          </p>
          <p className="mt-1 text-xs text-black/30 dark:text-white/30">
            Your public text notes will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      {notes.map((note) => (
        <div
          key={note.id}
          className="border-b border-black/5 px-4 py-3 dark:border-white/5"
        >
          <p className="whitespace-pre-wrap break-words text-sm text-black/80 dark:text-white/80">
            {note.content}
          </p>
          <p className="mt-1.5 text-xs text-black/30 dark:text-white/30">
            {relativeTime(note.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
