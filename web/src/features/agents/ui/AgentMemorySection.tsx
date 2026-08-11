import { useState } from "react";
import { Brain, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useAgentMemory } from "../useAgentMemory";

function SlugPill({ slug }: { slug: string }) {
  return (
    <span className="inline-flex items-center rounded bg-black/10 px-1.5 py-0.5 font-mono text-[11px] text-black/60 dark:bg-white/10 dark:text-white/60">
      [[{slug}]]
    </span>
  );
}

function renderBodyWithLinks(body: string) {
  const parts = body.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/);
    if (match) {
      return <SlugPill key={i} slug={match[1]} />;
    }
    return <span key={i}>{part}</span>;
  });
}

function EntryRow({ slug, body, links }: { slug: string; body: string; links: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <div className="mt-0.5 shrink-0 text-black/30 dark:text-white/30">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 font-mono text-xs font-medium text-black/70 dark:text-white/70">
            {slug}
          </p>
          {!expanded && (
            <p className="line-clamp-2 text-xs text-black/50 dark:text-white/50">
              {preview}
            </p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-black/5 px-3 pb-3 pt-2 dark:border-white/5">
          <p className="whitespace-pre-wrap text-xs text-black/70 dark:text-white/70">
            {renderBodyWithLinks(body)}
          </p>
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {links.map((link) => (
                <SlugPill key={link} slug={link} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  agentPubkey: string;
  viewerIsOwner: boolean;
}

export function AgentMemorySection({ agentPubkey, viewerIsOwner }: Props) {
  const { entries, isLoading, refetch } = useAgentMemory(agentPubkey);

  if (!viewerIsOwner) {
    return (
      <p className="text-sm text-black/40 dark:text-white/40">
        Memory is only visible to the agent owner.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 w-full animate-pulse rounded-lg bg-black/5 dark:bg-white/5"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
        <button
          type="button"
          onClick={refetch}
          aria-label="Refresh memory"
          className="rounded p-1 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Brain className="h-8 w-8 text-black/20 dark:text-white/20" />
          <p className="text-sm text-black/40 dark:text-white/40">
            No memory entries yet
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryRow
              key={entry.slug}
              slug={entry.slug}
              body={entry.body}
              links={entry.links}
            />
          ))}
        </div>
      )}
    </div>
  );
}
