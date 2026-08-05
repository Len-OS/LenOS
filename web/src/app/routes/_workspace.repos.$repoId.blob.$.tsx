import { createFileRoute } from "@tanstack/react-router";
import { RepoBlobPage } from "@/features/repos/ui/RepoBlobViewer";

export const Route = createFileRoute("/_workspace/repos/$repoId/blob/$")({
  component: RepoBlobPage,
});
