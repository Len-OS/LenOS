import { type ReactNode, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  extractSlug,
  fetchWorkspace,
  WorkspaceNotFoundError,
  type WorkspaceInfo,
} from "./workspace";

type WorkspaceState =
  | { status: "loading" }
  | { status: "found"; workspace: WorkspaceInfo }
  | { status: "not_found"; slug: string }
  | { status: "error"; error: Error }
  | { status: "no_subdomain" };

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

// Stable for the page lifetime — hostname never changes.
const slug = extractSlug();

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace", slug],
    queryFn: () => fetchWorkspace(slug!),
    enabled: slug !== null,
    retry: (failureCount, err) => {
      if (err instanceof WorkspaceNotFoundError) return false;
      return failureCount < 2;
    },
    staleTime: 5 * 60_000,
  });

  let state: WorkspaceState;
  if (slug === null) {
    state = { status: "no_subdomain" };
  } else if (isLoading) {
    state = { status: "loading" };
  } else if (error) {
    state =
      error instanceof WorkspaceNotFoundError
        ? { status: "not_found", slug }
        : { status: "error", error: error as Error };
  } else if (data) {
    state = { status: "found", workspace: data };
  } else {
    state = { status: "loading" };
  }

  return (
    <WorkspaceContext.Provider value={state}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

/** Returns the community UUID, or null in dev/no-subdomain mode. */
export function useCommunityId(): string | null {
  const state = useWorkspace();
  return state.status === "found" ? state.workspace.communityId : null;
}
