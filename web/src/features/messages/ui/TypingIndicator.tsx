import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface Props {
  pubkeys: string[];
}

function TyperAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.name ?? pubkey.slice(0, 8);
  return (
    <div
      className="w-5 h-5 rounded-full border border-background overflow-hidden bg-muted flex-shrink-0"
      title={name}
    >
      {profile?.picture ? (
        <img src={profile.picture} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] font-medium">
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function TypingName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{profile?.name ?? truncatePubkey(pubkey)}</>;
}

export function TypingIndicator({ pubkeys }: Props) {
  if (pubkeys.length === 0) return <div className="h-5" />;

  // Show max 3 avatars
  const displayedPubkeys = pubkeys.slice(0, 3);
  const hiddenCount = Math.max(0, pubkeys.length - 3);

  // Build names list for text
  const nameElements = displayedPubkeys.map((pubkey, idx) => (
    <span key={pubkey}>
      {idx > 0 && displayedPubkeys.length === 2 && " and "}
      {idx > 0 && displayedPubkeys.length > 2 && idx < displayedPubkeys.length - 1 && ", "}
      {idx > 0 && displayedPubkeys.length > 2 && idx === displayedPubkeys.length - 1 && ", and "}
      <TypingName pubkey={pubkey} />
    </span>
  ));

  // Build suffix
  const verbPhrase = pubkeys.length === 1 ? "is typing…" : "are typing…";
  const suffix = hiddenCount > 0 ? ` and ${hiddenCount} other${hiddenCount > 1 ? "s" : ""} are typing…` : ` ${verbPhrase}`;

  return (
    <div className="h-5 animate-pulse px-4 text-xs text-black/40 dark:text-white/40 flex items-center gap-2">
      <div className="flex gap-1">
        {displayedPubkeys.map((pubkey) => (
          <TyperAvatar key={pubkey} pubkey={pubkey} />
        ))}
      </div>
      <span className="flex items-center gap-1">
        {nameElements}
        {suffix}
      </span>
    </div>
  );
}
