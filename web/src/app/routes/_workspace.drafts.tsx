import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/drafts")({
  component: DraftsLayout,
});

function DraftsLayout() {
  return <Outlet />;
}
