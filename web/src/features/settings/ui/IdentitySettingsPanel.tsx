import { useEffect, useState } from "react";
import { nip19 } from "nostr-tools";
import {
  getCurrentPubkey,
  hasDurableIdentity,
  IDENTITY_STATE_CHANGE_EVENT,
} from "@/shared/lib/nostr-signer";

export function IdentitySettingsPanel() {
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (!hasDurableIdentity()) {
        setPubkey(null);
        return;
      }
      getCurrentPubkey()
        .then(setPubkey)
        .catch(() => setPubkey(null));
    };

    refresh();
    window.addEventListener(IDENTITY_STATE_CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(IDENTITY_STATE_CHANGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const npub = pubkey ? nip19.npubEncode(pubkey) : null;

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">
          Workspace connection
        </p>
        {npub ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-black/5 px-3 py-2 text-xs dark:bg-white/5">
              {npub}
            </code>
            <button
              type="button"
              onClick={() => copyText(npub)}
              className="shrink-0 rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Copy connection ID
            </button>
          </div>
        ) : (
          <p className="text-sm text-black/40 dark:text-white/40">
            Not connected yet. Open LenOS from your LenGrowth workspace to
            connect automatically.
          </p>
        )}
        {pubkey && (
          <p className="mt-2 text-xs text-black/40 dark:text-white/40">
            Connected and ready to use.
          </p>
        )}
      </div>
      <p className="rounded-md bg-black/5 px-3 py-2 text-sm text-black/60 dark:bg-white/5 dark:text-white/60">
        Your connection is managed securely for you. No extra setup is needed.
      </p>
    </div>
  );
}
