import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { Bookmark, Settings, Users } from "lucide-react";
import { ForumView } from "@/features/forum/ui/ForumView";
import { useMessages } from "@/features/messages/use-messages";
import { useChannels } from "@/features/channels/use-channels";
import { useReactions } from "@/features/messages/use-reactions";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import { ThreadPanel } from "@/features/messages/ui/ThreadPanel";
import { useReadState } from "@/features/channels/readState/useReadState";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { useTypingState } from "@/features/messages/useTypingState";
import { TypingIndicator } from "@/features/messages/ui/TypingIndicator";
import { ChannelFindBar } from "@/features/search/ui/ChannelFindBar";
import { MembersSidebar } from "@/features/channels/ui/MembersSidebar";
import { ChannelSettingsModal } from "@/features/channels/ui/ChannelSettingsModal";
import { useCustomEmoji } from "@/features/emoji/useCustomEmoji";
import { BotActivityBar } from "@/features/channels/ui/BotActivityBar";
import { AgentTranscriptViewer } from "@/features/agents/ui/AgentTranscriptViewer";
import { HuddleIndicator } from "@/features/huddle/ui/HuddleIndicator";
import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { useBookmarks } from "@/features/bookmarks/lib/useBookmarks";
import { useChannelBookmarks } from "@/features/bookmarks/lib/useChannelBookmarks";
import { ChannelBookmarksSection } from "@/features/channels/ui/ChannelBookmarksSection";
import { useMembers } from "@/features/channels/useMembers";
import { usePinnedMessages } from "@/features/messages/pinning/usePinnedMessages";
import { usePinMessage } from "@/features/messages/pinning/usePinMessage";
import { PinnedMessagesBar } from "@/features/messages/pinning/PinnedMessagesBar";
import { useReadReceipts } from "@/features/messages/read-receipts/useReadReceipts";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export function ChannelView() {
  const params = useParams({ strict: false }) as { channelId?: string };
  const channelId = params.channelId ?? "";
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const customEmoji = useCustomEmoji(communityId);
  const { messages, isLoading } = useMessages(channelId);
  const { markRead } = useReadState(channelId);
  const messageIds = messages.map((m) => m.id);
  const reactions = useReactions(channelId, messageIds);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const { save: saveMessage } = useBookmarks(currentPubkey);
  const { bookmark: bookmarkInChannel } = useChannelBookmarks(
    currentPubkey,
    channelId,
  );
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState<string | null>(
    null,
  );
  const agentProfile = useProfile(selectedAgentPubkey ?? "");
  const agentName =
    agentProfile?.name ||
    (selectedAgentPubkey ? truncatePubkey(selectedAgentPubkey) : "");
  const { typingPubkeys, notifyTyping } = useTypingState(
    channelId,
    currentPubkey,
  );

  const members = useMembers(channelId);
  const isCurrentUserAdmin =
    currentPubkey !== null &&
    members.some((m) => m.pubkey === currentPubkey && m.role === "admin");

  const pins = usePinnedMessages(channelId);
  const { pin, unpin } = usePinMessage(channelId, pins);
  const pinnedMessageIds = new Set(pins.map((p) => p.eventId));

  const readReceipts = useReadReceipts(channelId);
  const receiptDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleJumpTo = useCallback((eventId: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-message-id="${eventId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && e.key === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    markRead(last.createdAt);
    if (!isAtBottom) {
      if (receiptDebounceRef.current) clearTimeout(receiptDebounceRef.current);
      return;
    }
    if (receiptDebounceRef.current) clearTimeout(receiptDebounceRef.current);
    receiptDebounceRef.current = setTimeout(async () => {
      const content = JSON.stringify({
        last_read_event_id: last.id,
        last_read_at: last.createdAt,
      });
      try {
        const event = await signNostrEvent({
          kind: 30078,
          content,
          tags: [["d", `read:${channelId}`]],
          created_at: Math.floor(Date.now() / 1000),
        });
        await getRelayClient(relayWsUrl()).publishAndWait(
          event as Record<string, unknown>,
        );
      } catch {
        // ignore publish errors — signer may be unavailable
      }
    }, 2000);
  }, [messages, markRead, channelId, isAtBottom]);

  const channel = channels.find((c) => c.id === channelId);
  const channelName = channel?.name ?? channelId;

  const threadRootMessage = threadRootId
    ? (messages.find((m) => m.id === threadRootId) ?? null)
    : null;

  const visibleMessages =
    findOpen && findQuery
      ? messages.filter((m) =>
          m.content.toLowerCase().includes(findQuery.toLowerCase()),
        )
      : messages;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main channel column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center border-b border-black/10 px-4 dark:border-white/10">
          <span className="font-semibold text-black dark:text-white">
            # {channelName}
          </span>
          {channel?.description && (
            <span className="ml-3 truncate text-sm text-black/50 dark:text-white/40">
              {channel.description}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <HuddleIndicator channelId={channelId} />
            <BotActivityBar
              channelId={channelId}
              onOpenAgentTranscript={(pubkey) => {
                setSelectedAgentPubkey((prev) =>
                  prev === pubkey ? null : pubkey,
                );
                setThreadRootId(null);
              }}
            />
            <button
              type="button"
              onClick={() => setChannelSettingsOpen(true)}
              aria-label="Channel settings"
              className="rounded p-1.5 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowBookmarks((v) => !v)}
              aria-label="Toggle bookmarks panel"
              className={`rounded p-1.5 ${showBookmarks ? "text-black dark:text-white" : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"} hover:bg-black/5 dark:hover:bg-white/5`}
            >
              <Bookmark className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              aria-label="Toggle members panel"
              className={`rounded p-1.5 ${showMembers ? "text-black dark:text-white" : "text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"} hover:bg-black/5 dark:hover:bg-white/5`}
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
        </div>

        {findOpen && (
          <ChannelFindBar
            query={findQuery}
            onQueryChange={setFindQuery}
            matchCount={visibleMessages.length}
            onClose={closeFindBar}
          />
        )}

        {channel?.type === "forum" ? (
          <ForumView
            channelId={channelId}
            channelName={channelName}
            currentPubkey={currentPubkey}
          />
        ) : (
          <>
            <PinnedMessagesBar
              pins={pins}
              isAdmin={isCurrentUserAdmin}
              onJumpTo={handleJumpTo}
              onUnpin={(id) => void unpin(id)}
            />
            <MessageTimeline
              messages={visibleMessages}
              isLoading={isLoading}
              channelName={channelName}
              channelId={channelId}
              reactions={reactions}
              currentPubkey={currentPubkey}
              onOpenThread={setThreadRootId}
              customEmoji={customEmoji}
              onSave={(msgId) => {
                const msg = visibleMessages.find((m) => m.id === msgId);
                if (msg)
                  void saveMessage(msgId, {
                    pubkey: msg.pubkey,
                    content: msg.content,
                    createdAt: msg.createdAt,
                  });
              }}
              onBookmark={(msgId) => {
                void bookmarkInChannel(msgId);
              }}
              isAdmin={isCurrentUserAdmin}
              pinnedMessageIds={pinnedMessageIds}
              onPin={(msg) =>
                void pin(msg.id, currentPubkey ?? "", msg.content)
              }
              onUnpin={(id) => void unpin(id)}
              readReceipts={readReceipts}
              onAtBottomChange={setIsAtBottom}
            />
            <TypingIndicator pubkeys={[...typingPubkeys]} />
            <MessageComposer
              channelId={channelId}
              channelName={channelName}
              onTyping={notifyTyping}
              customEmoji={customEmoji}
            />
          </>
        )}
      </div>

      {/* Thread panel */}
      {threadRootMessage && (
        <ThreadPanel
          rootMessage={threadRootMessage}
          channelId={channelId}
          onClose={() => setThreadRootId(null)}
        />
      )}

      {/* Bookmarks panel */}
      {showBookmarks && (
        <div className="w-64 shrink-0 overflow-y-auto border-l border-black/10 dark:border-white/10">
          <ChannelBookmarksSection
            channelId={channelId}
            currentPubkey={currentPubkey}
            onJumpToMessage={(msgId) => {
              document
                .getElementById(msgId)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>
      )}

      {/* Members panel */}
      {showMembers && (
        <MembersSidebar
          channelId={channelId}
          onClose={() => setShowMembers(false)}
          currentPubkey={currentPubkey}
        />
      )}

      {/* Agent transcript panel */}
      {selectedAgentPubkey && (
        <AgentTranscriptViewer
          agentPubkey={selectedAgentPubkey}
          agentName={agentName}
          onClose={() => setSelectedAgentPubkey(null)}
        />
      )}

      <ChannelSettingsModal
        isOpen={channelSettingsOpen}
        onClose={() => setChannelSettingsOpen(false)}
        channelId={channelId}
        channelName={channelName}
        channelDescription={channel?.description ?? ""}
      />
    </div>
  );
}
