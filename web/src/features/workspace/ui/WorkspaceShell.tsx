import type { ReactNode } from "react";

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({ sidebar, children }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1a1a1a]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-black/10 dark:border-white/10 overflow-hidden">
        {sidebar}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
