import { useProfile } from "@/features/profiles/use-profile";
import { truncatePubkey } from "@/shared/lib/pubkey";

interface Props {
  pubkeys: string[];
}

function TypingName({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <>{profile?.name ?? truncatePubkey(pubkey)}</>;
}

export function TypingIndicator({ pubkeys }: Props) {
  if (pubkeys.length === 0) return <div className="h-5" />;
  return (
    <div className="h-5 animate-pulse px-4 text-xs text-black/40 dark:text-white/40">
      {pubkeys.length === 1 && (
        <>
          <TypingName pubkey={pubkeys[0]} /> is typing…
        </>
      )}
      {pubkeys.length === 2 && (
        <>
          <TypingName pubkey={pubkeys[0]} /> and{" "}
          <TypingName pubkey={pubkeys[1]} /> are typing…
        </>
      )}
      {pubkeys.length > 2 && "Several people are typing…"}
    </div>
  );
}
