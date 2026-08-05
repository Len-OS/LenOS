import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  matchCount: number;
  onClose: () => void;
}

export function ChannelFindBar({
  query,
  onQueryChange,
  matchCount,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-black/10 bg-white px-4 py-1.5 dark:border-white/10 dark:bg-[#1a1a1a]">
      <Search className="h-3.5 w-3.5 shrink-0 text-black/40 dark:text-white/40" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Find in channel…"
        className="flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/40 dark:text-white dark:placeholder:text-white/40"
      />
      {query && (
        <span className="text-xs text-black/40 dark:text-white/40">
          {matchCount} {matchCount === 1 ? "match" : "matches"}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
        aria-label="Close find bar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
