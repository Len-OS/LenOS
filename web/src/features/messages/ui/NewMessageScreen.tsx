import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { Avatar } from "@/shared/ui/Avatar";
import { prepareDmSendChannel } from "@/features/channels/usePrepareDmSendChannel";

interface FoundProfile {
  pubkey: string;
  name: string;
  picture?: string;
}

export function NewMessageScreen() {
  const navigate = useNavigate();
  const communityId = useCommunityId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundProfile[]>([]);
  const [selected, setSelected] = useState<FoundProfile[]>([]);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      queryEvents(relayWsUrl(), {
        kinds: [0],
        search: trimmed,
        limit: 20,
      }).then((events) => {
        const profiles: FoundProfile[] = events.flatMap((e) => {
          try {
            const data = JSON.parse(e.content as string) as {
              name?: string;
              display_name?: string;
              picture?: string;
            };
            const name = data.name ?? data.display_name ?? "";
            if (!name) return [];
            return [{ pubkey: e.pubkey, name, picture: data.picture }];
          } catch {
            return [];
          }
        });
        setResults(profiles);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const toggle = (profile: FoundProfile) => {
    setSelected((prev) =>
      prev.some((p) => p.pubkey === profile.pubkey)
        ? prev.filter((p) => p.pubkey !== profile.pubkey)
        : [...prev, profile],
    );
  };

  const open = async () => {
    if (selected.length === 0 || !communityId) return;
    setOpening(true);
    setError("");
    try {
      const currentPubkey = await getCurrentPubkey();
      const allPubkeys = [
        ...new Set([
          ...(currentPubkey ? [currentPubkey] : []),
          ...selected.map((p) => p.pubkey),
        ]),
      ];
      const channelId = await prepareDmSendChannel(allPubkeys, communityId);
      void navigate({
        to: "/messages/$channelId",
        params: { channelId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open DM.");
    }
    setOpening(false);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
        <span className="font-semibold text-black dark:text-white">
          New Message
        </span>
        <button
          type="button"
          onClick={() => void navigate({ to: "/messages" })}
          aria-label="Close"
          className="ml-auto rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-black/10 px-4 py-2 dark:border-white/10">
        <span className="text-sm text-black/50 dark:text-white/50">To:</span>
        {selected.map((p) => (
          <span
            key={p.pubkey}
            className="flex items-center gap-1 rounded-full bg-black/[0.08] px-2.5 py-1 text-xs text-black dark:bg-white/10 dark:text-white"
          >
            {p.name}
            <button
              type="button"
              onClick={() => toggle(p)}
              aria-label={`Remove ${p.name}`}
              className="ml-0.5 opacity-50 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          className="min-w-32 flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/30"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {results.map((p) => {
          const isSelected = selected.some((s) => s.pubkey === p.pubkey);
          return (
            <button
              key={p.pubkey}
              type="button"
              onClick={() => toggle(p)}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left ${isSelected ? "bg-black/[0.08] dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
            >
              <Avatar src={p.picture} name={p.name} size={28} />
              <span className="text-sm text-black dark:text-white">
                {p.name}
              </span>
              {isSelected && (
                <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {query && results.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-black/30 dark:text-white/30">
            No members found
          </p>
        )}
      </div>

      {error && (
        <p className="shrink-0 px-4 py-2 text-xs text-red-500">{error}</p>
      )}

      <div className="shrink-0 border-t border-black/10 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={() => void open()}
          disabled={selected.length === 0 || opening || !communityId}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {opening ? "Opening…" : "Open"}
        </button>
      </div>
    </div>
  );
}
