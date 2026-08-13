import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { publishHuddleNotes, subscribeHuddleNotes } from "../lib/huddleNotes";

interface Props {
  startedEventId: string;
  parentChannelId: string;
  onClose: () => void;
}

type SaveStatus = "idle" | "saving" | "saved";

function relativeTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function HuddleNotesPanel({
  startedEventId,
  parentChannelId,
  onClose,
}: Props) {
  const [content, setContent] = useState("");
  const [lastEditedAt, setLastEditedAt] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const unsub = subscribeHuddleNotes(
      startedEventId,
      (incoming, updatedAt) => {
        if (initialLoadRef.current) {
          setContent(incoming);
          setLastEditedAt(updatedAt);
          initialLoadRef.current = false;
        }
      },
    );
    return unsub;
  }, [startedEventId]);

  const handleChange = (value: string) => {
    setContent(value);
    setSaveStatus("saving");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await publishHuddleNotes(value, startedEventId, parentChannelId);
      setLastEditedAt(Math.floor(Date.now() / 1000));
      setSaveStatus("saved");
    }, 500);
  };

  return (
    <div className="fixed bottom-14 right-0 top-0 z-40 flex w-80 flex-col border-l border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#111]">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <span className="text-sm font-semibold text-black dark:text-white">
          Huddle Notes
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes panel"
          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Take notes during the huddle..."
        className="flex-1 resize-none bg-transparent p-4 text-sm text-black/90 outline-none placeholder:text-black/30 dark:text-white/85 dark:placeholder:text-white/30"
      />

      <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 dark:border-white/10">
        {lastEditedAt !== null && (
          <span className="text-xs text-black/40 dark:text-white/40">
            Last edited {relativeTime(lastEditedAt)}
          </span>
        )}
        {saveStatus === "saving" && (
          <span className="ml-auto text-xs text-black/40 dark:text-white/40">
            Saving...
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="ml-auto text-xs text-green-500">Saved</span>
        )}
      </div>
    </div>
  );
}
