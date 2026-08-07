import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/app/App";
import "@fontsource-variable/inter/wght.css";
import "@/shared/styles/globals.css";
import { ThemeProvider } from "@/shared/theme/ThemeProvider";
import { Toaster } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { WorkspaceProvider } from "@/shared/lib/workspace-context";
import { consumeManagedSignerSessionFromUrl } from "@/shared/lib/nostr-signer";

consumeManagedSignerSessionFromUrl();

// A deployment can leave an already-open tab pointing at an older hashed
// chunk. Ask Vite to reload the latest entrypoint instead of leaving the user
// with a dynamic-import error screen.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const url = new URL(window.location.href);
  url.searchParams.set("_asset_refresh", Date.now().toString());
  window.location.replace(url.toString());
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: "always",
      gcTime: 5 * 60 * 1_000,
    },
    mutations: {
      networkMode: "always",
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <WorkspaceProvider>
          <TooltipProvider delayDuration={300}>
            <App />
            <Toaster />
          </TooltipProvider>
        </WorkspaceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
