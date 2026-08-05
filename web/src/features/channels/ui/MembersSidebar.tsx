import { X } from "lucide-react";
import { useMembers } from "@/features/channels/useMembers";
import { MemberCard } from "./MemberCard";

interface Props {
  channelId: string | null;
  onClose: () => void;
  currentPubkey?: string | null;
}

export function MembersSidebar({ channelId, onClose, currentPubkey }: Props) {
  const members = useMembers(channelId);

  const admins = members.filter((m) => m.role === "admin");
  const others = members.filter((m) => m.role !== "admin");
  const isCurrentUserAdmin =
    currentPubkey != null && admins.some((m) => m.pubkey === currentPubkey);

  return (
    <div className="flex w-60 shrink-0 flex-col border-l border-black/10 dark:border-white/10">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/10 px-3 dark:border-white/10">
        <span className="text-sm font-semibold text-black dark:text-white">
          Members
          {members.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-black/40 dark:text-white/40">
              {members.length}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close members panel"
          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {admins.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
              Admins — {admins.length}
            </p>
            {admins.map((m) => (
              <MemberCard
                key={m.pubkey}
                member={m}
                channelId={channelId ?? ""}
                isCurrentUserAdmin={isCurrentUserAdmin}
              />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
              Members — {others.length}
            </p>
            {others.map((m) => (
              <MemberCard
                key={m.pubkey}
                member={m}
                channelId={channelId ?? ""}
                isCurrentUserAdmin={isCurrentUserAdmin}
              />
            ))}
          </div>
        )}

        {members.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-black/30 dark:text-white/30">
            No members yet
          </p>
        )}
      </div>
    </div>
  );
}
