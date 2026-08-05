import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { WorkspaceShell } from "@/features/workspace/ui/WorkspaceShell";
import { ChannelsSidebar } from "@/features/channels/ui/ChannelsSidebar";
import { useWorkspace } from "@/shared/lib/workspace-context";
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

  if (workspace.status === "loading") return <WorkspaceLoading />;
  if (workspace.status === "not_found")
    return <WorkspaceNotFound slug={workspace.slug} />;
  if (workspace.status === "error")
    return <WorkspaceLoadError message={workspace.error.message} />;
  if (workspace.status === "no_subdomain") return <Outlet />;

  return (
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
  );
}

export const Route = createFileRoute("/_workspace")({
  component: WorkspaceLayout,
});
