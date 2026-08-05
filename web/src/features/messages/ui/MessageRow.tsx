import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { relativeTime } from "@/shared/lib/relative-time";
import type { Message } from "@/features/messages/use-messages";

interface Props {
  msg: Message;
  isGrouped: boolean;
}

export function MessageRow({ msg, isGrouped }: Props) {
  const profile = useProfile(msg.pubkey);
  const displayName = profile?.name || truncatePubkey(msg.pubkey);

  return (
    <div className={isGrouped ? "pl-[44px]" : "mt-4 flex items-start gap-2.5"}>
      {!isGrouped && (
        <Avatar src={profile?.picture} name={displayName} size={32} />
      )}
      <div className={isGrouped ? "" : "min-w-0 flex-1"}>
        {!isGrouped && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-black dark:text-white">
              {displayName}
            </span>
            <span className="text-xs text-black/40 dark:text-white/40">
              {relativeTime(msg.createdAt)}
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-black/90 dark:text-white/85">
          {msg.content}
        </p>
      </div>
    </div>
  );
}
