import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/features/documents/ui/DocumentsPage";

export const Route = createFileRoute("/_workspace/documents")({
  component: DocumentsPage,
});
