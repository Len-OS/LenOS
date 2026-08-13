import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const PeoplePage = React.lazy(async () => {
  const module = await import("@/features/people/ui/PeoplePage");
  return { default: module.PeoplePage };
});

export const Route = createFileRoute("/people")({
  component: PeopleRouteComponent,
});

function PeopleRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <PeoplePage />
    </React.Suspense>
  );
}
