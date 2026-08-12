import { useEffect, useState } from "react";
import { Smartphone, Copy, Check } from "lucide-react";
import { nip19 } from "nostr-tools";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { Button } from "@/shared/ui/button";

const STEPS = [
  "Download LenOS for iOS or Android",
  "Open the app and tap Connect to workspace",
  "Enter your npub to link your identity",
  "Confirm pairing on both devices",
];

export function MobilePairingPanel() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getCurrentPubkey()
      .then(setPubkey)
      .catch(() => {});
  }, []);

  const npub = pubkey ? nip19.npubEncode(pubkey) : null;

  const handleCopy = async () => {
    if (!npub) return;
    await navigator.clipboard.writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Mobile Pairing
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Connect your mobile device to this LenOS identity.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-black/40 dark:text-white/40" />
          <div>
            <p className="text-sm font-medium text-black/70 dark:text-white/70">
              Your public key (npub)
            </p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Enter this in the LenOS mobile app to pair with your identity.
            </p>
          </div>
        </div>
      </div>

      {npub ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02]">
            <p className="break-all font-mono text-xs text-black/70 dark:text-white/70">
              {npub}
            </p>
          </div>
          <Button size="sm" onClick={() => void handleCopy()}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy npub
              </>
            )}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-black/40 dark:text-white/40">
          Loading identity…
        </p>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
          Steps
        </p>
        <div className="space-y-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold text-black/50 dark:bg-white/10 dark:text-white/50">
                {i + 1}
              </span>
              <p className="text-sm text-black/60 dark:text-white/60">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
