import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { useSearchResults } from "@/features/search/useSearchResults";
import { SearchResultItem } from "@/features/search/ui/SearchResultItem";
import type { Channel } from "@/features/channels/use-channels";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
}

export function SearchModal({ isOpen, onClose, channels }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityId = useCommunityId();
  const navigate = useNavigate();
  const { results, loading } = useSearchResults(query, communityId);

  useEffect(() => {
    if (isOpen) {
      setInput("");
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(input), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!isOpen) return null;

  const channelName = (channelId: string) =>
    channels.find((c) => c.id === channelId)?.name ?? channelId;

  const handleSelect = (channelId: string) => {
    onClose();
    void navigate({ to: "/channels/$channelId", params: { channelId } });
  };

  return (
    <>
    {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern, onKeyDown present */}
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={onClose}
      onKeyDown={() => {}}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search messages"
        className="w-full max-w-xl rounded-xl bg-white shadow-2xl dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <Search className="h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/40 dark:text-white dark:placeholder:text-white/40"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput("");
                setQuery("");
              }}
              className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-6 text-center text-sm text-black/40 dark:text-white/40">
              Searching…
            </p>
          )}
          {!loading && query && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-black/40 dark:text-white/40">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
          {!loading && !query && (
            <p className="px-3 py-6 text-center text-sm text-black/40 dark:text-white/40">
              Type to search messages
            </p>
          )}
          {results.map((r) => (
            <SearchResultItem
              key={r.id}
              result={r}
              query={query}
              channelName={channelName(r.channelId)}
              onClick={() => handleSelect(r.channelId)}
            />
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
