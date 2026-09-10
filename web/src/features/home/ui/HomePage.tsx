import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { useChannels } from "@/features/channels/use-channels";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useHomeInbox, type InboxItem } from "../useHomeInbox";
import { InboxItemRow } from "./InboxItemRow";
import { InboxDetailPane } from "./InboxDetailPane";
import { LenGrowthWorkspaceWelcome } from "@/features/onboarding/ui/LenGrowthWorkspaceWelcome";
import {
  InboxFilterMenu,
  DEFAULT_FILTER,
  type InboxFilter,
} from "./InboxFilterMenu";
import { FeedSection } from "./FeedSection";
import { RecentNotesSection } from "./RecentNotesSection";
import { GrowthHomeSection } from "@/features/growth/ui/GrowthHomeSection";
import { GrowthWorkSection } from "@/features/growth/ui/GrowthWorkSection";
import { GrowthExperimentsSection } from "@/features/growth/ui/GrowthExperimentsSection";
import { GrowthTeamSection } from "@/features/growth/ui/GrowthTeamSection";
import { GrowthAssetsSection } from "@/features/growth/ui/GrowthAssetsSection";
import { GrowthReportsSection } from "@/features/growth/ui/GrowthReportsSection";
import { GrowthPortfolioSection } from "@/features/growth/ui/GrowthPortfolioSection";
import {
  getGrowthReadiness,
  growthCompanyStorageKey,
} from "@/features/growth/api/growth-api";

function dateLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(
  items: ReturnType<typeof useHomeInbox>["items"],
): [string, typeof items][] {
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const label = dateLabel(item.createdAt);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return [...groups.entries()];
}

type Tab =
  | "inbox"
  | "feed"
  | "notes"
  | "growth"
  | "work"
  | "experiments"
  | "team"
  | "assets"
  | "reports"
  | "portfolio";

const TABS: { id: Tab; label: string }[] = [
  { id: "growth", label: "Growth Home" },
  { id: "work", label: "Work" },
  { id: "experiments", label: "Experiments" },
  { id: "team", label: "Team" },
  { id: "assets", label: "Assets" },
  { id: "reports", label: "Reports" },
  { id: "portfolio", label: "Portfolio" },
  { id: "inbox", label: "Inbox" },
  { id: "feed", label: "Feed" },
  { id: "notes", label: "Notes" },
];

function reportLinkedTab(): Tab | null {
  const requested = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((tab) => tab.id === requested) ? (requested as Tab) : null;
}

export function HomePage() {
  const communityId = useCommunityId();
  const workspace = useWorkspace();
  const channels = useChannels(communityId);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(
    () => reportLinkedTab() ?? "inbox",
  );
  const [growthTaskId, setGrowthTaskId] = useState<string | null>(null);
  const [hasSelectedTab, setHasSelectedTab] = useState(
    () => reportLinkedTab() !== null,
  );
  const [filter, setFilter] = useState<InboxFilter>(DEFAULT_FILTER);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  const { items, markRead, markAllRead } = useHomeInbox(currentPubkey);
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";
  const companyId = workspaceSlug
    ? localStorage.getItem(growthCompanyStorageKey(workspaceSlug))
    : null;
  const growthReadiness = useQuery({
    queryKey: ["growth", "rollout", workspaceSlug, companyId],
    enabled: Boolean(
      workspaceSlug && communityId && currentPubkey && companyId,
    ),
    queryFn: () =>
      getGrowthReadiness({
        envelope: {
          correlationId: `growth-rollout:${workspaceSlug}`,
          idempotencyKey: `growth-rollout-read:${workspaceSlug}`,
          workspaceSlug,
          relayCommunityId: communityId ?? "",
          actorPubkey: currentPubkey ?? "",
          companyId,
        },
      }),
  });
  const rolloutFlags = (
    (growthReadiness.data?.operationalHealth ?? {}) as Record<string, unknown>
  ).dependencies as Record<string, unknown> | undefined;
  const growthFlags = (rolloutFlags?.growthFlags ?? {}) as Record<
    string,
    unknown
  >;
  const growthEnabled = growthFlags.growthOs === true;
  const experimentsEnabled = growthFlags.growthExperiments === true;
  const portfolioEnabled = growthFlags.growthPortfolio === true;
  const visibleTabs = TABS.filter((tab) => {
    if (["growth", "work", "team", "assets", "reports"].includes(tab.id)) {
      return growthEnabled;
    }
    if (tab.id === "experiments") return growthEnabled && experimentsEnabled;
    if (tab.id === "portfolio") return growthEnabled && portfolioEnabled;
    return true;
  });
  useEffect(() => {
    if (growthEnabled && !hasSelectedTab && activeTab === "inbox") {
      setActiveTab("growth");
    }
  }, [activeTab, growthEnabled, hasSelectedTab]);
  useEffect(() => {
    if (growthReadiness.isPending) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("inbox");
    }
  }, [activeTab, growthReadiness.isPending, visibleTabs]);
  useEffect(() => {
    const openGrowthTask = (event: Event) => {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!taskId) return;
      setGrowthTaskId(taskId);
      setHasSelectedTab(true);
      setActiveTab("work");
    };
    window.addEventListener("lenos:growth-open-task", openGrowthTask);
    return () =>
      window.removeEventListener("lenos:growth-open-task", openGrowthTask);
  }, []);

  const filteredItems = items.filter(
    (item) =>
      filter.types.has(item.type) && (!filter.unreadOnly || !item.isRead),
  );
  const unreadCount = items.filter((i) => !i.isRead).length;
  const groups = groupByDate(filteredItems);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <nav
          aria-label="Home sections"
          className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-black/10 px-4 dark:border-white/10"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setHasSelectedTab(true);
                setActiveTab(tab.id);
              }}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-black/[0.08] font-medium text-black dark:bg-white/10 dark:text-white"
                  : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              }`}
            >
              {tab.label}
              {tab.id === "inbox" && unreadCount > 0 && (
                <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}

          {activeTab === "inbox" && (
            <div className="ml-auto flex items-center gap-2">
              <InboxFilterMenu filter={filter} onChange={setFilter} />
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                >
                  Mark all read
                </button>
              )}
            </div>
          )}
        </nav>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "growth" && <GrowthHomeSection />}
          {activeTab === "work" && (
            <GrowthWorkSection initialTaskId={growthTaskId} />
          )}
          {activeTab === "experiments" && <GrowthExperimentsSection />}
          {activeTab === "team" && <GrowthTeamSection />}
          {activeTab === "assets" && <GrowthAssetsSection />}
          {activeTab === "reports" && <GrowthReportsSection />}
          {activeTab === "portfolio" && <GrowthPortfolioSection />}
          {activeTab === "inbox" && (
            <>
              <LenGrowthWorkspaceWelcome />
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Inbox className="h-10 w-10 text-black/20 dark:text-white/20" />
                  <div>
                    <p className="text-sm font-medium text-black/50 dark:text-white/50">
                      No messages
                    </p>
                    <p className="mt-1 text-xs text-black/30 dark:text-white/30">
                      {filter.unreadOnly || filter.types.size < 3
                        ? "Try removing some filters."
                        : "Messages that mention you will appear here."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  {groups.map(([label, groupItems]) => (
                    <div key={label}>
                      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
                        {label}
                      </div>
                      {groupItems.map((item) => (
                        <InboxItemRow
                          key={item.messageId}
                          item={item}
                          channels={channels}
                          active={selectedItem?.messageId === item.messageId}
                          onClick={() => {
                            markRead(item.messageId);
                            setSelectedItem(item);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "feed" && <FeedSection />}

          {activeTab === "notes" && (
            <RecentNotesSection pubkey={currentPubkey} />
          )}
        </div>
      </div>

      {selectedItem && activeTab === "inbox" && (
        <div className="w-[400px] shrink-0">
          <InboxDetailPane
            item={selectedItem}
            channels={channels}
            onClose={() => setSelectedItem(null)}
          />
        </div>
      )}
    </div>
  );
}
