import { useEffect, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { relativeTime } from "@/shared/lib/relative-time";
import { ProjectReadOnlyBanner } from "./ProjectReadOnlyBanner";

const KIND_GIT_PULL_REQUEST = 1618;

interface PullRequest {
  id: string;
  title: string;
  status: string;
  author: string;
  createdAt: number;
}

interface Props {
  repoId: string;
}

export function ProjectPullRequestsPanel({ repoId }: Props) {
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!repoId) return;
    setIsLoading(true);
    let cancelled = false;

    queryEvents(relayWsUrl(), {
      kinds: [KIND_GIT_PULL_REQUEST],
      "#a": [repoId],
      limit: 100,
    })
      .then((events) => {
        if (cancelled) return;
        const parsed: PullRequest[] = events.map((raw) => {
          const tags = (raw.tags as string[][]) ?? [];
          const title =
            tags.find((t) => t[0] === "title")?.[1] ??
            tags.find((t) => t[0] === "name")?.[1] ??
            "Untitled PR";
          const status = tags.find((t) => t[0] === "status")?.[1] ?? "open";
          return {
            id: raw.id,
            title,
            status,
            author: raw.pubkey,
            createdAt: raw.created_at,
          };
        });
        setPrs(parsed.sort((a, b) => b.createdAt - a.createdAt));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repoId]);

  return (
    <div className="mt-6">
      <ProjectReadOnlyBanner />
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-black/5 dark:bg-white/5"
            />
          ))}
        </div>
      ) : prs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <GitPullRequest className="h-8 w-8 text-black/20 dark:text-white/20" />
          <p className="text-sm text-black/40 dark:text-white/40">
            No pull requests found
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 bg-white/50 dark:border-white/10 dark:bg-white/5">
          {prs.map((pr) => (
            <div
              key={pr.id}
              className="flex items-center gap-3 border-b border-black/10 px-3 py-2.5 last:border-b-0 dark:border-white/10"
            >
              <GitPullRequest className="h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black dark:text-white">
                  {pr.title}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40">
                  {relativeTime(pr.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  pr.status === "merged"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    : pr.status === "closed"
                      ? "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                }`}
              >
                {pr.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
