import { X } from "lucide-react";
import { useHuddle } from "../HuddleContext";
import { useProfile } from "@/features/profiles/use-profile";
import { Avatar } from "@/shared/ui/Avatar";

function ParticipantRow({
  peerIndex,
  pubkey,
}: {
  peerIndex: number;
  pubkey: string;
}) {
  const { activeSpeakerIndexes } = useHuddle();
  const profile = useProfile(pubkey);
  const name = profile?.name ?? pubkey.slice(0, 8);
  const speaking = activeSpeakerIndexes.includes(peerIndex);
  return (
    <div
      className={
        "flex items-center gap-2 rounded-md px-2 py-1.5 " +
        (speaking ? "bg-green-500/10" : "")
      }
    >
      <div
        className={
          speaking ? "ring-2 ring-green-400 ring-offset-1 rounded-full" : ""
        }
      >
        <Avatar src={profile?.picture} name={name} size={28} />
      </div>
      <span className="text-sm text-black dark:text-white">{name}</span>
      {speaking && (
        <span className="ml-auto text-xs text-green-500">speaking</span>
      )}
    </div>
  );
}

export function HuddleParticipants({ onClose }: { onClose: () => void }) {
  const { peers } = useHuddle();
  return (
    <div className="absolute bottom-full right-0 mb-2 w-52 rounded-xl border border-black/10 bg-white py-2 shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-black/40 dark:text-white/40">
          Participants — {peers.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {peers.map((p) => (
        <ParticipantRow
          key={p.peerIndex}
          peerIndex={p.peerIndex}
          pubkey={p.pubkey}
        />
      ))}
    </div>
  );
}
