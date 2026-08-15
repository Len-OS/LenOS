import { WorkspaceSwitcher } from "@/features/communities/ui/WorkspaceSwitcher";
import {
  useWorkspaceBrandingContext,
  useCommunityId,
} from "@/shared/lib/workspace-context";

export function CommunityRail() {
  const { avatar } = useWorkspaceBrandingContext();
  const communityId = useCommunityId();
  const initials = communityId ? communityId[0].toUpperCase() : "W";

  return (
    <div className="flex h-full w-14 flex-col items-center border-r border-black/10 bg-black/[0.02] py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg">
        {avatar ? (
          <img
            src={avatar}
            alt="Workspace"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-lg bg-black/10 text-sm font-semibold text-black/60 dark:bg-white/10 dark:text-white/60"
            style={{
              backgroundColor: "var(--workspace-accent)",
              color: "#fff",
            }}
          >
            {initials}
          </div>
        )}
      </div>
      <WorkspaceSwitcher />
    </div>
  );
}
