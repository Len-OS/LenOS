import { useEffect, useState, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { Settings, Users } from "lucide-react";
import { ForumView } from "@/features/forum/ui/ForumView";
import { useMessages } from "@/features/messages/use-messages";
import { useChannels } from "@/features/channels/use-channels";
import { useReactions } from "@/features/messages/use-reactions";
import { useCommunityId } from "@/shared/lib/workspace-context";
import { MessageTimeline } from "@/features/messages/ui/MessageTimeline";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import { ThreadPanel } from "@/features/messages/ui/ThreadPanel";
import { useReadState } from "@/features/channels/readState/useReadState";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
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
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
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
    if (last) markRead(last.createdAt);
  }, [messages, markRead]);

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
            <MessageTimeline
              messages={visibleMessages}
              isLoading={isLoading}
              channelName={channelName}
              channelId={channelId}
              reactions={reactions}
              currentPubkey={currentPubkey}
              onOpenThread={setThreadRootId}
              customEmoji={customEmoji}
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
