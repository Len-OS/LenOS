import { useProfile } from "@/features/profiles/use-profile";
import { ReadReceipt } from "./types";

interface Props {
  receipts: ReadReceipt[];
  maxVisible?: number;
}

function AvatarPip({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const name = profile?.name ?? pubkey.slice(0, 8);
  const src = profile?.picture;
  return (
    <div
      className="w-5 h-5 rounded-full border border-background overflow-hidden bg-muted -ml-1 first:ml-0"
      title={name}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] font-medium bg-primary/20 text-primary">
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function ReadAvatarStack({ receipts, maxVisible = 3 }: Props) {
  if (receipts.length === 0) return null;
  const visible = receipts.slice(0, maxVisible);
  const overflow = receipts.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((r) => (
        <AvatarPip key={r.pubkey} pubkey={r.pubkey} />
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full border border-background bg-muted -ml-1 flex items-center justify-center text-[9px] font-medium">
          +{overflow}
        </div>
      )}
    </div>
  );
}
