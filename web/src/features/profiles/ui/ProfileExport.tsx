import { useCallback, useState } from "react";
import { Download, Check } from "lucide-react";
import { nip19 } from "nostr-tools";
import { Button } from "@/shared/ui/button";

interface ProfileData {
  name?: string;
  picture?: string;
  about?: string;
}

interface Props {
  pubkey: string;
  profile: ProfileData | null;
}

export function ProfileExportButton({ pubkey, profile }: Props) {
  const [exported, setExported] = useState(false);

  const handleExport = useCallback(() => {
    const npub = (() => {
      try {
        return nip19.npubEncode(pubkey);
      } catch {
        return pubkey;
      }
    })();

    const snapshot = {
      npub,
      pubkey,
      name: profile?.name ?? null,
      about: profile?.about ?? null,
      picture: profile?.picture ?? null,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lenos-profile-${npub.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }, [pubkey, profile]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="gap-1.5"
    >
      {exported ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {exported ? "Exported" : "Export profile"}
    </Button>
  );
}
