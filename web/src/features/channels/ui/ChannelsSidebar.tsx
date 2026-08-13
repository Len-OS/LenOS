import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Bookmark,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSearch,
  FileText,
  Hash,
  Inbox,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SettingsModal } from "@/features/settings/ui/SettingsModal";
import { CommunitySettingsModal } from "@/features/communities/ui/CommunitySettingsModal";
import { useMembers } from "@/features/channels/useMembers";
import { CreateChannelModal } from "@/features/channels/ui/CreateChannelModal";
import { ChannelContextMenu } from "@/features/channels/ui/ChannelContextMenu";
import { ChannelSettingsModal } from "@/features/channels/ui/ChannelSettingsModal";
import { DmList } from "@/features/messages/ui/DmList";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { SidebarProfileCard } from "@/features/profile/ui/SidebarProfileCard";
import { useChannels } from "@/features/channels/use-channels";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";
import { useSidebarState } from "@/features/sidebar/useSidebarState";
import { useProfilePanel } from "@/features/profiles/profile-panel-context";

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
  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false);
  const [channelSettingsFor, setChannelSettingsFor] = useState<string | null>(
    null,
  );
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const members = useMembers(communityId);
  const isAdmin =
    currentPubkey != null &&
    members.some((m) => m.pubkey === currentPubkey && m.role === "admin");
  const { openProfile } = useProfilePanel();

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
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener("open-settings", openSettings);
    return () => window.removeEventListener("open-settings", openSettings);
  }, []);

  const workspaceName =
    workspace.status === "found" ? workspace.workspace.slug : "Workspace";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
        <button
          type="button"
          onClick={() => {
            if (isAdmin) setCommunitySettingsOpen(true);
          }}
          className={`truncate font-semibold text-black dark:text-white ${isAdmin ? "cursor-pointer hover:underline" : "cursor-default"}`}
        >
          {workspaceName}
        </button>
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
                  {section.channels.length === 0 &&
                    section.id === "channels" && (
                      <div className="px-5 py-1 text-xs text-black/30 dark:text-white/30">
                        No channels yet
                      </div>
                    )}
                  {section.channels.map((ch) => {
                    const isActive = activeChannelId === ch.id;
                    const unread = isUnread(ch.id);
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
                        <ChannelContextMenu
                          isStarred={isCurrentlyStarred}
                          isMuted={isCurrentlyMuted}
                          isAdmin={isAdmin}
                          onStar={() => toggleStar(ch.id)}
                          onMute={() => toggleMute(ch.id)}
                          onMarkRead={() => markRead(ch.id)}
                          onSettings={() => setChannelSettingsFor(ch.id)}
                        />
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
            to="/home"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Inbox
          </Link>
          <Link
            to="/reminders"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Bell className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Reminders
          </Link>
          <Link
            to="/workflows"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Zap className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Workflows
          </Link>
          <Link
            to="/pulse"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Activity className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Pulse
          </Link>
          <Link
            to="/agents"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Bot className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Agents
          </Link>
          <Link
            to="/documents"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <FileSearch className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Documents
          </Link>
          <Link
            to="/drafts"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Drafts
          </Link>
          <Link
            to="/drafts/scheduled"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Clock className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Scheduled
          </Link>
          <Link
            to="/saved"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Bookmark className="h-3.5 w-3.5 shrink-0 opacity-50" />
            Saved
          </Link>
          <Link
            to="/people"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            activeProps={{
              className:
                "bg-black/10 font-medium text-black dark:bg-white/15 dark:text-white",
            }}
          >
            <Users className="h-3.5 w-3.5 shrink-0 opacity-50" />
            People
          </Link>
        </div>
      </nav>

      {currentPubkey && (
        <SidebarProfileCard
          pubkey={currentPubkey}
          statusPickerOpen={statusPickerOpen}
          onToggleStatusPicker={() => setStatusPickerOpen((v) => !v)}
          onCloseStatusPicker={() => setStatusPickerOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProfile={() => openProfile(currentPubkey)}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <CreateChannelModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        communityId={communityId ?? ""}
      />
      {communityId && (
        <CommunitySettingsModal
          isOpen={communitySettingsOpen}
          communityId={communityId}
          isAdmin={isAdmin}
          onClose={() => setCommunitySettingsOpen(false)}
        />
      )}
      {channelSettingsFor &&
        (() => {
          const ch = channels.find((c) => c.id === channelSettingsFor);
          if (!ch) return null;
          return (
            <ChannelSettingsModal
              isOpen
              onClose={() => setChannelSettingsFor(null)}
              channelId={ch.id}
              channelName={ch.name}
              channelDescription={ch.description}
              channelVisibility={ch.visibility}
              isAdmin={isAdmin}
            />
          );
        })()}
    </div>
  );
}
