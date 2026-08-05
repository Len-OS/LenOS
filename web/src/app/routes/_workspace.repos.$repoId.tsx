import { createFileRoute } from "@tanstack/react-router";
import { RepoDetailPage } from "@/features/repos/ui/RepoDetailPage";

export const Route = createFileRoute("/_workspace/repos/$repoId")({
  component: RepoDetailPage,
});
