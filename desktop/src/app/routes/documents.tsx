import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const DocumentsPage = React.lazy(async () => {
  const module = await import("@/features/documents/ui/DocumentsPage");
  return { default: module.DocumentsPage };
});

export const Route = createFileRoute("/documents")({
  component: DocumentsRouteComponent,
});

function DocumentsRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <DocumentsPage />
    </React.Suspense>
  );
}
