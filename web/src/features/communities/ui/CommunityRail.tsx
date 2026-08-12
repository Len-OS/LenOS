import { WorkspaceSwitcher } from "@/features/communities/ui/WorkspaceSwitcher";

export function CommunityRail() {
  return (
    <div className="flex h-full w-14 flex-col items-center border-r border-black/10 bg-black/[0.02] py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <WorkspaceSwitcher />
    </div>
  );
}
