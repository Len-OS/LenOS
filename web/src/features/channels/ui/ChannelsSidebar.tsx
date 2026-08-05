import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  MoreHorizontal,
  Plus,
  Settings,
  Star,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SettingsModal } from "@/features/settings/ui/SettingsModal";
import { CreateChannelModal } from "@/features/channels/ui/CreateChannelModal";
import { DmList } from "@/features/messages/ui/DmList";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useUserStatus } from "@/features/profile/useUserStatus";
import { StatusPicker } from "@/features/profile/ui/StatusPicker";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { useSidebarState } from "@/features/sidebar/useSidebarState";

interface Props {
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelsSidebar({ activeChannelId, onSelectChannel }: Props) {
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const workspace = useWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentStatus = useUserStatus(currentPubkey ?? "");

  const {
    sections,
    collapsedSections,
    toggleCollapse,
    unreadOnly,
    setUnreadOnly,
    toggleMute,
    toggleStar,
    markRead,
    isUnread,
  } = useSidebarState({ channels, communityId });

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpenFor) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenFor(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenFor]);

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <span className="truncate font-semibold text-black dark:text-white">
          {workspaceName}
        </span>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
              !unreadOnly
                ? "bg-black/10 text-black dark:bg-white/15 dark:text-white"
                : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
              unreadOnly
                ? "bg-black/10 text-black dark:bg-white/15 dark:text-white"
                : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((section) => {
          const isCollapsed = collapsedSections.has(section.id);
          return (
            <div key={section.id} className="mb-1">
              <div className="mb-0.5 flex items-center px-2">
                <button
                  type="button"
                  onClick={() => toggleCollapse(section.id)}
                  className="flex flex-1 items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wider text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  )}
                  {section.label}
                </button>
                {section.id === "channels" && (
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    aria-label="Create channel"
                    className="rounded p-0.5 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div>
                  {section.channels.length === 0 && section.id === "channels" && (
                    <div className="px-5 py-1 text-xs text-black/30 dark:text-white/30">
                      No channels yet
                    </div>
                  )}
                  {section.channels.map((ch) => {
                    const isActive = activeChannelId === ch.id;
                    const unread = isUnread(ch.id);
                    const menuOpen = menuOpenFor === ch.id;
                    const isCurrentlyStarred = section.id === "starred";
                    const isCurrentlyMuted = section.id === "muted";
                    return (
                      <div key={ch.id} className="group relative px-2">
                        <button
                          type="button"
                          onClick={() => onSelectChannel(ch.id)}
                          className={[
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                            isActive
                              ? "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white"
                              : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5",
                          ].join(" ")}
                        >
                          <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          <span className="truncate">{ch.name}</span>
                          {unread && !isActive && (
                            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Channel options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenFor(menuOpen ? null : ch.id);
                          }}
                          className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-black/40 hover:bg-black/10 hover:text-black group-hover:flex dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {menuOpen && (
                          <div
                            ref={menuRef}
                            className="absolute right-2 top-full z-40 mt-0.5 w-40 rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                toggleStar(ch.id);
                                setMenuOpenFor(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                            >
                              <Star className="h-3.5 w-3.5" />
                              {isCurrentlyStarred ? "Unstar" : "Star"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                toggleMute(ch.id);
                                setMenuOpenFor(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                            >
                              {isCurrentlyMuted ? "Unmute" : "Mute"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                markRead(ch.id);
                                setMenuOpenFor(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                            >
                              Mark as read
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-4 pb-2">
          <DmList currentPubkey={currentPubkey} communityId={communityId} />
        </div>

        <div className="px-2 pb-1">
          <Link
            to="/workflows"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{ className: "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white" }}
          >
            <Zap className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Workflows
          </Link>
        </div>
      </nav>

      <div className="relative shrink-0 border-t border-black/10 px-3 py-2 dark:border-white/10">
        {statusPickerOpen && currentPubkey && (
          <div className="absolute bottom-full left-3 z-30 mb-1">
            <StatusPicker
              currentPubkey={currentPubkey}
              onClose={() => setStatusPickerOpen(false)}
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusPickerOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="text-base leading-none">
              {currentStatus?.emoji ?? "😶"}
            </span>
            <span className="truncate text-xs text-black/60 dark:text-white/60">
              {currentStatus?.text || "Set a status"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <CreateChannelModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        communityId={communityId ?? ""}
      />
    </div>
  );
}
