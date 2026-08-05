import { createFileRoute, redirect } from "@tanstack/react-router";
import { extractSlug } from "@/shared/lib/workspace";
import { ReposPage } from "@/features/repos/ui/ReposPage";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (extractSlug()) {
      throw redirect({ to: "/channels" });
    }
  },
  component: ReposPage,
});
