import { useState, useEffect } from "react";
import { nip19 } from "nostr-tools";
import { getCurrentPubkey, hasNip07Provider } from "@/shared/lib/nostr-signer";

export function IdentitySettingsPanel() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [nsecInput, setNsecInput] = useState("");
  const [importError, setImportError] = useState("");
  const [imported, setImported] = useState(false);

  useEffect(() => {
    getCurrentPubkey().then(setPubkey).catch(() => {});
  }, []);

  const npub = pubkey ? nip19.npubEncode(pubkey) : null;

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  const importNsec = () => {
    setImportError("");
    try {
      const decoded = nip19.decode(nsecInput.trim());
      if (decoded.type !== "nsec") {
        setImportError("Not a valid nsec key.");
        return;
      }
      const privkeyBytes = decoded.data as Uint8Array;
      const privkeyHex = Array.from(privkeyBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("lenos_privkey", privkeyHex);
      setImported(true);
      setNsecInput("");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setImportError("Invalid key format.");
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">
          Public key (npub)
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
              Copy
            </button>
          </div>
        ) : (
          <p className="text-sm text-black/40 dark:text-white/40">
            No identity loaded.
          </p>
        )}
        {pubkey && (
          <p className="mt-2 truncate text-xs text-black/30 dark:text-white/30">
            hex: {pubkey}
          </p>
        )}
      </div>

      {hasNip07Provider() && (
        <p className="rounded-md bg-black/5 px-3 py-2 text-sm text-black/60 dark:bg-white/5 dark:text-white/60">
          Identity controlled by browser extension.
        </p>
      )}

      {!hasNip07Provider() && (
        <div>
          <p className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">
            Import key (nsec)
          </p>
          <input
            type="password"
            value={nsecInput}
            onChange={(e) => setNsecInput(e.target.value)}
            placeholder="nsec1…"
            className="mb-2 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
          />
          {importError && (
            <p className="mb-2 text-xs text-red-500">{importError}</p>
          )}
          {imported && (
            <p className="mb-2 text-xs text-green-600">
              Key imported — reloading…
            </p>
          )}
          <button
            type="button"
            onClick={importNsec}
            disabled={!nsecInput.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
          >
            Import key
          </button>
        </div>
      )}
    </div>
  );
}
