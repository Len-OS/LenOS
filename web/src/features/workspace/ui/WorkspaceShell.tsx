import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { CommunityRail } from "@/features/communities/ui/CommunityRail";
import { useWorkspaceBrandingContext } from "@/shared/lib/workspace-context";

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
  rightPanel?: ReactNode;
}

export function WorkspaceShell({ sidebar, children, rightPanel }: Props) {
  const { accentColor } = useWorkspaceBrandingContext();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close mobile sidebar on md+ resize
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1a1a1a]"
      style={
        accentColor
          ? ({ "--workspace-accent": accentColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Rail + sidebar: always visible on md+, drawer on mobile */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 flex md:relative md:z-auto",
          mobileSidebarOpen ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        <CommunityRail />
        <aside
          aria-label="Channel navigation"
          className="flex w-60 shrink-0 flex-col border-r border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1a1a1a]"
        >
          {sidebar}
        </aside>
      </div>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header bar with menu toggle */}
        <div className="flex h-10 shrink-0 items-center border-b border-black/10 px-3 dark:border-white/10 md:hidden">
          <button
            type="button"
            aria-label={
              mobileSidebarOpen ? "Close navigation" : "Open navigation"
            }
            aria-expanded={mobileSidebarOpen}
            aria-controls="mobile-sidebar"
            onClick={() => setMobileSidebarOpen((v) => !v)}
            className="rounded p-1.5 text-black/50 hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
          >
            {mobileSidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>

      {rightPanel}
    </div>
  );
}
