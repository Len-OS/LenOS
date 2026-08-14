import { useRef, useState } from "react";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { ProfilePopover } from "@/features/profiles/ui/ProfilePopover";
import { useModerationActions } from "@/features/moderation/useModerationActions";
import { useProfilePanel } from "@/features/profiles/profile-panel-context";
import { PresenceBadge } from "@/features/presence/ui/PresenceBadge";
import type { Member } from "@/features/channels/useMembers";

function truncatePubkey(pk: string): string {
  return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
}

interface Props {
  member: Member;
  channelId: string;
  isCurrentUserAdmin?: boolean;
  onSendDm?: (pubkey: string) => void;
}

export function MemberCard({
  member,
  channelId,
  isCurrentUserAdmin,
  onSendDm,
}: Props) {
  const profile = useProfile(member.pubkey);
  const displayName = profile?.name || truncatePubkey(member.pubkey);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { muteUser, banUser } = useModerationActions();
  const { openProfile } = useProfilePanel();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Avatar src={profile?.picture} name={displayName} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-black dark:text-white">
            {displayName}
          </p>
        </div>
        <PresenceBadge pubkey={member.pubkey} size="xs" />
        {member.role === "admin" && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
            admin
          </span>
        )}
      </button>

      <div className="absolute left-full top-0 z-30 ml-2">
        <ProfilePopover
          pubkey={member.pubkey}
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          onViewProfile={(pk) => {
            openProfile(pk);
            setPopoverOpen(false);
          }}
          onSendDm={onSendDm}
        />
        {isCurrentUserAdmin && popoverOpen && (
          <div className="mt-1 w-44 rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e]">
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/5"
              onClick={() => {
                void muteUser(member.pubkey, channelId);
                setPopoverOpen(false);
              }}
            >
              Mute user
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-500/5"
              onClick={() => {
                void banUser(member.pubkey, channelId);
                setPopoverOpen(false);
              }}
            >
              Ban user
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
