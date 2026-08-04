import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/shared/lib/workspace-context";
import { WorkspaceNotFoundPage } from "@/shared/ui/WorkspaceNotFoundPage";
import lengrowthIcon from "@/assets/lengrowth-icon.png";

export const Route = createRootRoute({
  component: RootLayout,
});

function WorkspaceLoadingPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F3F3F3] dark:bg-[#171717]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-12 w-12 animate-pulse overflow-hidden bg-black"
          style={{ borderRadius: "22.37%" }}
        >
          <img alt="LenGrowth" className="h-full w-full" src={lengrowthIcon} />
        </div>
        <p className="text-sm text-black/50 dark:text-white/50">
          Loading workspace…
        </p>
      </div>
    </div>
  );
}

function RootLayout() {
  const workspace = useWorkspace();

  if (workspace.status === "loading") {
    return <WorkspaceLoadingPage />;
  }

  if (workspace.status === "not_found") {
    return <WorkspaceNotFoundPage slug={workspace.slug} />;
  }

  if (workspace.status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F3F3F3] px-4 dark:bg-[#171717]">
        <div className="text-center">
          <p className="text-sm text-black/60 dark:text-white/60">
            Failed to load workspace: {workspace.error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
