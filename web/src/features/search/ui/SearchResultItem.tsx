import type { SearchResult } from "@/features/search/useSearchResults";
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface Props {
  result: SearchResult;
  query: string;
  channelName: string;
  onClick: () => void;
}

function highlight(text: string, query: string) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: highlight split parts have no stable identity
        <mark key={i} className="rounded-sm bg-yellow-200 dark:bg-yellow-700">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function SearchResultItem({
  result,
  query,
  channelName,
  onClick,
}: Props) {
  const profile = useProfile(result.pubkey);
  const name = profile?.name ?? truncatePubkey(result.pubkey);
  const date = new Date(result.createdAt * 1000).toLocaleDateString();

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
    >
      <div className="mb-0.5 flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
        <span className="font-medium text-black/60 dark:text-white/60">
          #{channelName}
        </span>
        <span>·</span>
        <span>{name}</span>
        <span>·</span>
        <span>{date}</span>
      </div>
      <p className="line-clamp-2 text-sm text-black dark:text-white">
        {query ? highlight(result.content, query) : result.content}
      </p>
    </button>
  );
}
