import type { ReactNode } from "react";
import { CommunityRail } from "@/features/communities/ui/CommunityRail";
import { useWorkspaceBrandingContext } from "@/shared/lib/workspace-context";

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
  rightPanel?: ReactNode;
}

export function WorkspaceShell({ sidebar, children, rightPanel }: Props) {
  const { accentColor } = useWorkspaceBrandingContext();

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1a1a1a]"
      style={
        accentColor
          ? ({ "--workspace-accent": accentColor } as React.CSSProperties)
          : undefined
      }
    >
      <CommunityRail />
      <aside className="flex w-60 shrink-0 flex-col border-r border-black/10 dark:border-white/10 overflow-hidden">
        {sidebar}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      {rightPanel}
    </div>
  );
}
