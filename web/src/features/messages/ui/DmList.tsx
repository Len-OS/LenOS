import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";
import { formatDmParticipantDisplayName } from "@/features/channels/lib/dmParticipantDisplay";

interface DmChannel {
  id: string;
  participantPubkeys: string[];
  createdAt: number;
}

function truncatePubkey(pk: string): string {
  return `${pk.slice(0, 6)}…`;
}

function DmRow({
  dm,
  currentPubkey,
  onClick,
}: {
  dm: DmChannel;
  currentPubkey: string | null;
  onClick: () => void;
}) {
  const others = dm.participantPubkeys.filter((pk) => pk !== currentPubkey);
  const firstOther = others[0] ?? dm.participantPubkeys[0] ?? "";
  const profile = useProfile(firstOther);

  const displayName = formatDmParticipantDisplayName(
    others.length > 0 ? others : dm.participantPubkeys,
    (pk) => {
      if (pk === firstOther) return profile?.name || truncatePubkey(pk);
      return truncatePubkey(pk);
    },
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
    >
      <Avatar src={profile?.picture} name={displayName} size={32} />
      <span className="truncate text-sm text-black dark:text-white">
        {displayName}
      </span>
    </button>
  );
}

interface Props {
  currentPubkey: string | null;
  communityId: string | null;
}

export function DmList({ currentPubkey, communityId }: Props) {
  const navigate = useNavigate();
  const [dms, setDms] = useState<DmChannel[]>([]);

  useEffect(() => {
    if (!communityId) return;
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: `dm-list-${communityId}`,
      filter: { kinds: [39000], "#h": [communityId], "#private": [""] },
      onEvent: (raw) => {
        const tags = (raw.tags as string[][]) ?? [];
        const dTag = tags.find((t) => t[0] === "d")?.[1] ?? "";
        if (!dTag) return;
        const pTags = tags.filter((t) => t[0] === "p").map((t) => t[1]);
        setDms((prev) => {
          const filtered = prev.filter((d) => d.id !== dTag);
          return [
            ...filtered,
            {
              id: dTag,
              participantPubkeys: pTags,
              createdAt: raw.created_at as number,
            },
          ].sort((a, b) => b.createdAt - a.createdAt);
        });
      },
    });
    return () => {
      unsub();
      setDms([]);
    };
  }, [communityId]);

  return (
    <div>
      <div className="mb-1 flex items-center px-4">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
          Direct Messages
        </span>
        <button
          type="button"
          onClick={() => void navigate({ to: "/messages/new" })}
          aria-label="New direct message"
          className="rounded p-0.5 text-black/30 hover:bg-black/5 hover:text-black dark:text-white/30 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {dms.length === 0 && (
        <p className="px-4 py-1 text-xs text-black/30 dark:text-white/30">
          No messages yet
        </p>
      )}
      {dms.map((dm) => (
        <DmRow
          key={dm.id}
          dm={dm}
          currentPubkey={currentPubkey}
          onClick={() =>
            void navigate({
              to: "/messages/$channelId",
              params: { channelId: dm.id },
            })
          }
        />
      ))}
    </div>
  );
}
