import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchDocuments, type ChunkMatch } from "../useDocuments";

interface Props {
  channelId?: string;
}

export function DocumentSearchPanel({ channelId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChunkMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setError(null);
    setSearching(true);
    try {
      const chunks = await searchDocuments(query.trim(), channelId);
      setResults(chunks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Ask a question about your documents…"
          className="flex-1 rounded-lg border border-black/20 bg-white px-3 py-2 text-sm placeholder-black/30 focus:outline-none focus:ring-2 focus:ring-black/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/30 dark:focus:ring-white/20"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </button>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((chunk) => (
            <div
              key={`${chunk.document_id}-${chunk.chunk_index}`}
              className="rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-black/50 dark:text-white/50">
                  {chunk.document_name}
                </span>
                <span className="shrink-0 text-xs text-black/30 dark:text-white/30">
                  {Math.round(chunk.score * 100)}%
                </span>
              </div>
              <p className="text-sm text-black/80 dark:text-white/80">
                {chunk.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {!searching && results.length === 0 && query && (
        <p className="text-center text-sm text-black/30 dark:text-white/30">
          No matching passages found
        </p>
      )}
    </div>
  );
}
