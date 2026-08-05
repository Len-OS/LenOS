import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/features/workspace/ui/WorkspaceShell";
import { ChannelsSidebar } from "@/features/channels/ui/ChannelsSidebar";
import { useWorkspace, useCommunityId } from "@/shared/lib/workspace-context";
import { useChannels } from "@/features/channels/use-channels";
import { SearchModal } from "@/features/search/ui/SearchModal";
import {
  WorkspaceNotFound,
  WorkspaceLoadError,
  WorkspaceLoading,
} from "@/features/auth/ui/WorkspaceErrorView";

function WorkspaceLayout() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { channelId?: string };
  const activeChannelId = params.channelId ?? null;
  const communityId = useCommunityId();
  const channels = useChannels(communityId);
  const [searchOpen, setSearchOpen] = useState(false);

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
