import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getCurrentPubkey,
  hasDurableIdentity,
} from "@/shared/lib/nostr-signer";
import { WorkspaceShell } from "@/features/workspace/ui/WorkspaceShell";
import { ChannelsSidebar } from "@/features/channels/ui/ChannelsSidebar";
import { useWorkspace, useCommunityId } from "@/shared/lib/workspace-context";
import { useChannels } from "@/features/channels/use-channels";
import { SearchModal } from "@/features/search/ui/SearchModal";
import { OnboardingGate } from "@/features/onboarding/ui/OnboardingGate";
import { KeyringLockedScreen } from "@/features/onboarding/ui/KeyringLockedScreen";
import { useFeedBrowserNotifications } from "@/features/notifications/useFeedBrowserNotifications";
import { useDnd } from "@/features/notifications/lib/useDnd";
import { useScheduledDelivery } from "@/features/messages/lib/useScheduledDelivery";
import {
  WorkspaceNotFound,
  WorkspaceLoadError,
  WorkspaceLoading,
} from "@/features/auth/ui/WorkspaceErrorView";
import {
  ProfilePanelProvider,
  useProfilePanel,
} from "@/features/profiles/profile-panel-context";
import { HuddleProvider } from "@/features/huddle/HuddleContext";
import { HuddleBar } from "@/features/huddle/ui/HuddleBar";
import { HuddleFloatingBar } from "@/features/huddle/ui/HuddleFloatingBar";
import { UserProfilePanel } from "@/features/profiles/ui/UserProfilePanel";
import { usePresenceHeartbeat } from "@/features/presence/usePresenceHeartbeat";
import {
  useDeepLinkHandler,
  registerWebPlusLenOSProtocol,
} from "@/features/deep-links/useDeepLinkHandler";

const IDENTITY_SEEN_KEY = "lenos_identity_seen";

function useIdentityLocked() {
  const [locked, setLocked] = useState(() => {
    const hadIdentity = localStorage.getItem(IDENTITY_SEEN_KEY) === "1";
    return hadIdentity && !hasDurableIdentity();
  });

  useEffect(() => {
    if (!locked && hasDurableIdentity()) {
      localStorage.setItem(IDENTITY_SEEN_KEY, "1");
    }
  }, [locked]);

  return { locked, unlock: () => setLocked(false) };
}

function WorkspaceLayout() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { channelId?: string };
  const activeChannelId = params.channelId ?? null;
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const { locked, unlock } = useIdentityLocked();

  useEffect(() => {
    getCurrentPubkey()
      .then(setCurrentPubkey)
      .catch(() => {});
  }, []);

  useFeedBrowserNotifications({ channels, currentPubkey, communityId });
  useDnd(currentPubkey ?? null);
  useScheduledDelivery();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (workspace.status === "loading") return <WorkspaceLoading />;
  if (workspace.status === "not_found")
    return <WorkspaceNotFound slug={workspace.slug} />;
  if (workspace.status === "error")
    return <WorkspaceLoadError message={workspace.error.message} />;
  if (workspace.status === "no_subdomain") return <Outlet />;

  if (locked) {
    return <KeyringLockedScreen onRecovered={unlock} />;
  }

  return (
    <OnboardingGate>
      <HuddleProvider>
        <ProfilePanelProvider>
          <WorkspaceLayoutInner
            activeChannelId={activeChannelId}
            navigate={navigate}
            channels={channels}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            currentPubkey={currentPubkey}
          />
        </ProfilePanelProvider>
        <HuddleBar />
        <HuddleFloatingBar />
      </HuddleProvider>
    </OnboardingGate>
  );
}

interface InnerProps {
  activeChannelId: string | null;
  navigate: ReturnType<typeof useNavigate>;
  channels: ReturnType<typeof useChannels>;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  currentPubkey: string | null;
}

function WorkspaceLayoutInner({
  activeChannelId,
  navigate,
  channels,
  searchOpen,
  setSearchOpen,
  currentPubkey,
}: InnerProps) {
  const {
    pubkey: profilePubkey,
    openProfile,
    closeProfile,
  } = useProfilePanel();
  const communityId = useCommunityId();
  usePresenceHeartbeat(currentPubkey, communityId);
  useDeepLinkHandler({ navigate, openProfile });

  useEffect(() => {
    registerWebPlusLenOSProtocol();
  }, []);

  return (
    <>
      <WorkspaceShell
        sidebar={
          <ChannelsSidebar
            activeChannelId={activeChannelId}
            onSelectChannel={(id) =>
              void navigate({
                to: "/channels/$channelId",
                params: { channelId: id },
              })
            }
          />
        }
        rightPanel={
          profilePubkey ? (
            <UserProfilePanel
              pubkey={profilePubkey}
              open
              onClose={closeProfile}
              isSelf={profilePubkey === currentPubkey}
            />
          ) : undefined
        }
      >
        <Outlet />
      </WorkspaceShell>
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        channels={channels}
      />
    </>
  );
}

export const Route = createFileRoute("/_workspace")({
  component: WorkspaceLayout,
});
